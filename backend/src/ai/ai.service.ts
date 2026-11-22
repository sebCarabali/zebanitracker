import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createGateway } from '@ai-sdk/gateway';
import { createGroq } from '@ai-sdk/groq';
import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';

export const LANGUAGES: Record<string, string> = {
  es: 'español', en: 'English', pt: 'português', fr: 'français', it: 'italiano', de: 'Deutsch', ja: '日本語', ko: '한국어',
};

export interface Candidate {
  anilist_id: number;
  title: string;
  year: number | null;
  format: string | null;
  episodes: number | null;
  genres: string[];
  score: number | null;
  source: string; // por qué es candidato: "recomendado por AniList para X", "popular en Fantasy"…
}

/** Modelos de Groq a probar en orden si AI_MODEL no está definido (si uno se retira, se usa el siguiente). */
const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];

/**
 * IA con Groq (GROQ_API_KEY). Si no hay clave de Groq, usa Vercel AI Gateway
 * (token OIDC de la petición o AI_GATEWAY_API_KEY).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly usage = new Map<string, number[]>();
  readonly provider = process.env.GROQ_API_KEY ? 'groq' : 'vercel-ai-gateway';
  private readonly models = process.env.AI_MODEL
    ? [process.env.AI_MODEL]
    : this.provider === 'groq' ? GROQ_MODELS : ['anthropic/claude-haiku-5.5'];
  /** Modelo que respondió la última vez (se prueba primero). */
  modelId = this.models[0];

  private model(id: string, oidcToken?: string): LanguageModel {
    if (process.env.GROQ_API_KEY) return createGroq({ apiKey: process.env.GROQ_API_KEY })(id);
    const apiKey = process.env.AI_GATEWAY_API_KEY || oidcToken;
    if (!apiKey) throw new ServiceUnavailableException('La IA no está disponible en este entorno');
    return createGateway({ apiKey })(id);
  }

  /** Ejecuta con el modelo vigente; si fue retirado o no existe, prueba el siguiente de la lista. */
  private async withModel<T>(oidcToken: string | undefined, fn: (model: LanguageModel) => Promise<T>): Promise<T> {
    const order = [this.modelId, ...this.models.filter((m) => m !== this.modelId)];
    let last: unknown;
    for (const id of order) {
      try {
        const out = await fn(this.model(id, oidcToken));
        this.modelId = id;
        return out;
      } catch (e) {
        last = e;
        const msg = (e as Error)?.message ?? '';
        if (!/model.*(not found|not exist|decommission|deprecat|unavailable|not supported)|model_not_found|does not exist/i.test(msg)) break;
        this.logger.warn(`Modelo ${id} no disponible, probando el siguiente: ${msg}`);
      }
    }
    return this.friendly(last);
  }

  /** Traduce errores del gateway a mensajes claros para el usuario. */
  private friendly(e: unknown): never {
    const msg = (e as Error)?.message ?? '';
    this.logger.warn(`AI Gateway: ${msg}`);
    if (e instanceof HttpException) throw e;
    if (/credit card|free credits|insufficient|quota|balance|invalid api key|unauthorized|401/i.test(msg)) {
      throw new ServiceUnavailableException('La IA aún no está activada en el servidor. Vuelve a intentarlo más tarde.');
    }
    if (/rate limit|429|too many/i.test(msg)) {
      throw new HttpException('La IA está recibiendo muchas solicitudes. Intenta en un minuto.', HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new BadGatewayException('La IA no respondió. Intenta de nuevo en un momento.');
  }

  /** Límite simple por usuario y acción (por instancia del servidor) para cuidar el crédito. */
  limit(userId: string, action: string, perDay: number) {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const recent = (this.usage.get(key) ?? []).filter((t) => now - t < 86_400_000);
    if (recent.length >= perDay) {
      throw new HttpException(`Llegaste al límite diario de ${perDay} usos de esta función de IA. Vuelve mañana.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.usage.set(key, recent);
  }

  /** Traduce una sinopsis conservando nombres propios y saltos de párrafo. */
  async translate(oidcToken: string | undefined, text: string, lang: string): Promise<string> {
    const { text: out } = await this.withModel(oidcToken, (model) => generateText({
      model,
      maxOutputTokens: 2000,
      temperature: 0.2,
      system:
        `Eres traductor profesional de sinopsis de anime. Traduce al ${LANGUAGES[lang] ?? lang} de forma natural y fiel. ` +
        'Conserva los nombres propios, títulos y términos japoneses tal como aparecen. Mantén los saltos de párrafo. ' +
        'Si aparece una nota de fuente como "(Source: X)", tradúcela como "(Fuente: X)" en el idioma destino. ' +
        'Responde solo con la traducción, sin comentarios ni comillas.',
      prompt: text,
    }));
    return stripReasoning(out).trim();
  }


  /** Llamada genérica que devuelve JSON validado (o null si el modelo no cumplió el formato). */
  async json<T>(oidcToken: string | undefined, args: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number; temperature?: number }): Promise<T | null> {
    const { text } = await this.withModel(oidcToken, (model) => generateText({
      model,
      maxOutputTokens: args.maxTokens ?? 2000,
      temperature: args.temperature ?? 0.3,
      system: args.system + ' Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después ni bloques de código.',
      prompt: args.prompt,
    }));
    const out = parseJson(text, args.schema);
    if (!out) this.logger.warn(`JSON de IA no válido: ${text.slice(0, 200)}`);
    return out;
  }

  /** Convierte "algo como Frieren pero más corto y con romance" en filtros de AniList. */
  async searchIntent(oidcToken: string | undefined, query: string, genres: string[], tags: string[]): Promise<SearchIntent | null> {
    return this.json(oidcToken, {
      temperature: 0.1,
      maxTokens: 1200,
      schema: SearchIntentSchema,
      system:
        'Conviertes peticiones en lenguaje natural (en cualquier idioma) sobre anime, manga o novelas ligeras en filtros de búsqueda de AniList. ' +
        `Géneros válidos (usa SOLO estos, en inglés): ${genres.join(', ')}. ` +
        `Etiquetas válidas (usa solo de esta lista, en inglés, máx. 4): ${tags.slice(0, 400).join(', ')}. ` +
        'Formatos válidos: TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL (anime); MANGA, ONE_SHOT (manga); NOVEL. ' +
        'Si menciona obras concretas como referencia ("como Frieren", "parecido a Death Note"), ponlas en similar_to con su título más conocido y NO uses search. ' +
        'Usa search solo si busca un título concreto por nombre. "Corto" ≈ episodes_max 13 (o 1 película); "largo" ≈ episodes_min 40. ' +
        '"Reciente" ≈ year_from hace 3 años; "clásico" ≈ year_to 2005. "Buena nota" ≈ min_score 75. ' +
        'Sé conservador: pocos filtros que no dejen la búsqueda vacía (máx. 2 géneros obligatorios). ' +
        'explanation: una frase en el idioma del usuario que resuma cómo lo interpretaste. ' +
        'Forma: {"media":"anime","similar_to":["Frieren"],"genres":["Romance"],"exclude_genres":[],"tags":[],"formats":[],"episodes_max":13,' +
        '"episodes_min":null,"year_from":null,"year_to":null,"status":null,"min_score":null,"sort":"SCORE_DESC","search":null,"explanation":"..."}',
      prompt: `Año actual: ${new Date().getFullYear()}.\nPetición: ${query}`,
    });
  }

  /** Ordena candidatos reales según la petición y explica por qué encaja cada uno. */
  async rankSearch(oidcToken: string | undefined, args: { query: string; lang: string; candidates: Candidate[]; count: number }) {
    const ids = new Set(args.candidates.map((c) => c.anilist_id));
    const schema = z.object({ picks: z.array(z.object({ anilist_id: z.number().int(), reason: z.string() })).max(args.count + 5) });
    const lines = args.candidates.map((c) =>
      `${c.anilist_id} | ${c.title} | ${c.year ?? '?'} | ${c.format ?? '?'} | ${c.episodes ?? '?'} caps | ${c.genres.join(', ')} | ${c.score ?? '?'}% | ${c.source}`);
    const out = await this.json(oidcToken, {
      temperature: 0.3,
      maxTokens: 2500,
      schema,
      system:
        'Eres un buscador semántico de anime y manga. Recibes lo que pide el usuario y una lista de candidatos reales. ' +
        'Elige los que mejor encajan con TODO lo que pide (tono, duración, temas, obras de referencia), del mejor al peor, ' +
        'descartando los que no encajan aunque eso deje menos resultados. Usa SOLO IDs de la lista. ' +
        `Escribe las razones en ${LANGUAGES[args.lang] ?? args.lang}, máx. 1 frase cada una, concretas (no repitas la petición). ` +
        'Forma: {"picks":[{"anilist_id":123,"reason":"..."}]}',
      prompt: `PETICIÓN: ${args.query}\n\nCANDIDATOS (id | título | año | formato | capítulos | géneros | puntuación | origen)\n${lines.join('\n')}\n\nElige hasta ${args.count}.`,
    });
    const seen = new Set<number>();
    return (out?.picks ?? []).filter((p) => ids.has(p.anilist_id) && !seen.has(p.anilist_id) && seen.add(p.anilist_id)).slice(0, args.count);
  }

  /** Resumen sin spoilers de lo ocurrido hasta el capítulo `episode` (incluido). */
  async recap(oidcToken: string | undefined, args: {
    lang: string; title: string; mediaType: string; episode: number; total: number | null;
    synopsis: string | null; episodeTitles: string[];
  }) {
    const unit = args.mediaType === 'anime' ? 'capítulo' : 'capítulo del manga/novela';
    const schema = z.object({
      recap: z.string(),
      key_points: z.array(z.string()).max(8),
      confidence: z.enum(['high', 'medium', 'low']),
    });
    return this.json(oidcToken, {
      temperature: 0.2,
      maxTokens: 2500,
      schema,
      system:
        `Ayudas a alguien a retomar una serie que dejó hace tiempo. Resume lo que pasó hasta el ${unit} ${args.episode} INCLUSIVE. ` +
        'REGLA ABSOLUTA: no reveles nada que ocurra después de ese punto (ni giros, ni muertes, ni personajes que aparecen después, ni el final). ' +
        'Si no estás seguro de en qué punto ocurre algo, omítelo. No inventes: si no conoces bien la obra, da un resumen general del ' +
        'planteamiento (basado en la sinopsis) y pon confidence "low". Recuerda los personajes principales y dónde quedó la historia. ' +
        `Escribe en ${LANGUAGES[args.lang] ?? args.lang}, en 2-3 párrafos cortos (recap) y 3-6 puntos clave para recordar (key_points). ` +
        'Forma: {"recap":"...","key_points":["..."],"confidence":"high"}',
      prompt:
        `Obra: ${args.title} (${args.mediaType})\nVa en el ${unit} ${args.episode}${args.total ? ` de ${args.total}` : ''}.\n` +
        (args.synopsis ? `Sinopsis oficial (inicio de la historia): ${args.synopsis.slice(0, 1500)}\n` : '') +
        (args.episodeTitles.length ? `Títulos de los capítulos que YA vio:\n${args.episodeTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n` : ''),
    });
  }

  /** Resumen divertido del mes a partir de estadísticas reales. */
  async monthly(oidcToken: string | undefined, args: { lang: string; month: string; stats: string }) {
    const schema = z.object({ headline: z.string(), summary: z.string(), fun_facts: z.array(z.string()).max(6) });
    return this.json(oidcToken, {
      temperature: 0.7,
      maxTokens: 1500,
      schema,
      system:
        'Escribes el "resumen del mes" de una app de seguimiento de anime: cercano, con humor ligero y emojis con moderación. ' +
        'Usa SOLO los datos que te dan (no inventes cifras ni títulos). Habla en segunda persona. ' +
        `Escribe en ${LANGUAGES[args.lang] ?? args.lang}. headline: un titular corto y pegadizo; summary: 2-3 frases; ` +
        'fun_facts: 3-5 datos curiosos derivados de las estadísticas (comparaciones, récords, rarezas). ' +
        'Forma: {"headline":"...","summary":"...","fun_facts":["..."]}',
      prompt: `Mes: ${args.month}\n${args.stats}`,
    });
  }

  /**
   * Elige recomendaciones SOLO entre `candidates` (títulos reales de AniList), con una razón personalizada.
   * Así la IA no puede inventar animes que no existen.
   */
  async recommend(oidcToken: string | undefined, args: {
    lang: string;
    profile: string;
    candidates: Candidate[];
    request?: string;
    count: number;
  }) {
    const ids = new Set(args.candidates.map((c) => c.anilist_id));
    const schema = z.object({
      summary: z.string().describe('Una frase sobre los gustos del usuario, en segunda persona'),
      picks: z.array(z.object({
        anilist_id: z.number().int().describe('ID exacto de la lista de candidatos'),
        reason: z.string().describe('Por qué le gustaría, mencionando animes o gustos concretos del usuario (máx. 2 frases)'),
      })).max(args.count + 4),
    });

    const lines = args.candidates.map((c) =>
      `${c.anilist_id} | ${c.title} | ${c.year ?? '?'} | ${c.format ?? '?'} | ${c.episodes ?? '?'} caps | ${c.genres.join(', ')} | ${c.score ?? '?'}% | ${c.source}`);

    const { text } = await this.withModel(oidcToken, (model) => generateText({
      model,
      maxOutputTokens: 3000,
      temperature: 0.5,
      system:
        'Eres un recomendador de anime experto. Recibes el perfil de un usuario (historial, puntuaciones, favoritos, ' +
        'abandonados y preferencias) y una lista de candidatos reales. Elige los que mejor encajen y explica por qué, ' +
        'conectando con animes concretos que el usuario vio o puntuó. Evita lo que se parezca a lo que abandonó o ' +
        'puntuó bajo. Varía géneros si el perfil lo permite. Usa SOLO IDs de la lista de candidatos. ' +
        `Escribe todo el texto en ${LANGUAGES[args.lang] ?? args.lang}. ` +
        'Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después ni bloques de código, con esta forma: ' +
        '{"summary": "una frase sobre sus gustos, en segunda persona", "picks": [{"anilist_id": 123, "reason": "máx. 2 frases"}]}',
      prompt:
        `PERFIL DEL USUARIO\n${args.profile}\n\n` +
        (args.request ? `LO QUE PIDE AHORA: ${args.request}\n\n` : '') +
        `CANDIDATOS (id | título | año | formato | capítulos | géneros | puntuación AniList | origen)\n${lines.join('\n')}\n\n` +
        `Elige ${args.count} candidatos, del más recomendado al menos.`,
    }));
    const output = parseJson(text, schema);
    if (!output) this.logger.warn(`Respuesta de IA no válida: ${text.slice(0, 200)}`);

    const seen = new Set<number>();
    const picks = (output?.picks ?? []).filter((p) => ids.has(p.anilist_id) && !seen.has(p.anilist_id) && seen.add(p.anilist_id));
    if (!picks.length) this.logger.warn('La IA no devolvió candidatos válidos');
    return { summary: output?.summary ?? '', picks: picks.slice(0, args.count) };
  }
}


/** Filtros de AniList que la IA puede producir a partir de una frase. */
export const SearchIntentSchema = z.object({
  media: z.enum(['anime', 'manga', 'novel']).optional(),
  search: z.string().max(100).optional().nullable(),
  similar_to: z.array(z.string().max(100)).max(3).optional().nullable(),
  genres: z.array(z.string()).max(6).optional().nullable(),
  exclude_genres: z.array(z.string()).max(6).optional().nullable(),
  tags: z.array(z.string()).max(6).optional().nullable(),
  formats: z.array(z.string()).max(6).optional().nullable(),
  episodes_min: z.number().int().min(1).max(5000).optional().nullable(),
  episodes_max: z.number().int().min(1).max(5000).optional().nullable(),
  year_from: z.number().int().min(1940).max(2100).optional().nullable(),
  year_to: z.number().int().min(1940).max(2100).optional().nullable(),
  status: z.enum(['RELEASING', 'FINISHED', 'NOT_YET_RELEASED']).optional().nullable(),
  min_score: z.number().int().min(1).max(100).optional().nullable(),
  sort: z.enum(['POPULARITY_DESC', 'SCORE_DESC', 'TRENDING_DESC', 'START_DATE_DESC']).optional().nullable(),
  explanation: z.string().max(300).optional().nullable(),
});
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

/** Algunos modelos (gpt-oss, qwen) pueden devolver su razonamiento entre <think>…</think>. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

/** Extrae el primer objeto JSON de la respuesta y lo valida con el esquema. */
export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  const clean = stripReasoning(text).replace(/```(?:json)?/gi, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(clean.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
