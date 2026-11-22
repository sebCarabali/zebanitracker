import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createGateway } from '@ai-sdk/gateway';
import { generateText, Output } from 'ai';
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

/**
 * IA vía Vercel AI Gateway. En Vercel se autentica con el token OIDC de cada petición
 * (cabecera x-vercel-oidc-token); en local o fuera de Vercel, con AI_GATEWAY_API_KEY.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly usage = new Map<string, number[]>();
  readonly modelId = process.env.AI_MODEL ?? 'anthropic/claude-haiku-5.5';

  private model(oidcToken?: string) {
    const apiKey = process.env.AI_GATEWAY_API_KEY || oidcToken;
    if (!apiKey) throw new ServiceUnavailableException('La IA no está disponible en este entorno');
    return createGateway({ apiKey })(this.modelId);
  }

  /** Traduce errores del gateway a mensajes claros para el usuario. */
  private friendly(e: unknown): never {
    const msg = (e as Error)?.message ?? '';
    this.logger.warn(`AI Gateway: ${msg}`);
    if (e instanceof HttpException) throw e;
    if (/credit card|free credits|insufficient|quota|balance/i.test(msg)) {
      throw new ServiceUnavailableException('La IA aún no está activada en el servidor. Vuelve a intentarlo más tarde.');
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
    const { text: out } = await generateText({
      model: this.model(oidcToken),
      maxOutputTokens: 2000,
      temperature: 0.2,
      system:
        `Eres traductor profesional de sinopsis de anime. Traduce al ${LANGUAGES[lang] ?? lang} de forma natural y fiel. ` +
        'Conserva los nombres propios, títulos y términos japoneses tal como aparecen. Mantén los saltos de párrafo. ' +
        'Si aparece una nota de fuente como "(Source: X)", tradúcela como "(Fuente: X)" en el idioma destino. ' +
        'Responde solo con la traducción, sin comentarios ni comillas.',
      prompt: text,
    }).catch((e) => this.friendly(e));
    return out.trim();
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

    const { output } = await generateText({
      model: this.model(oidcToken),
      maxOutputTokens: 2500,
      temperature: 0.5,
      output: Output.object({ schema }),
      system:
        'Eres un recomendador de anime experto. Recibes el perfil de un usuario (historial, puntuaciones, favoritos, ' +
        'abandonados y preferencias) y una lista de candidatos reales. Elige los que mejor encajen y explica por qué, ' +
        'conectando con animes concretos que el usuario vio o puntuó. Evita lo que se parezca a lo que abandonó o ' +
        'puntuó bajo. Varía géneros si el perfil lo permite. Usa SOLO IDs de la lista de candidatos. ' +
        `Escribe todo el texto en ${LANGUAGES[args.lang] ?? args.lang}.`,
      prompt:
        `PERFIL DEL USUARIO\n${args.profile}\n\n` +
        (args.request ? `LO QUE PIDE AHORA: ${args.request}\n\n` : '') +
        `CANDIDATOS (id | título | año | formato | capítulos | géneros | puntuación AniList | origen)\n${lines.join('\n')}\n\n` +
        `Elige ${args.count} candidatos, del más recomendado al menos.`,
    }).catch((e) => this.friendly(e));

    const seen = new Set<number>();
    const picks = (output?.picks ?? []).filter((p) => ids.has(p.anilist_id) && !seen.has(p.anilist_id) && seen.add(p.anilist_id));
    if (!picks.length) this.logger.warn('La IA no devolvió candidatos válidos');
    return { summary: output?.summary ?? '', picks: picks.slice(0, args.count) };
  }
}
