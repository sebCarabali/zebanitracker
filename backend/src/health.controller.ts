import { Controller, Get, Headers } from '@nestjs/common';
import { AiService } from './ai/ai.service.js';
import { AniListService } from './anilist/anilist.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly anilist: AniListService, private readonly ai: AiService) {}

  @Get()
  check() {
    return { ok: true };
  }

  /** Verifica que la IA responde (traducción mínima). Limitado a 5 por hora para no gastar crédito. */
  @Get('ai')
  async aiCheck(@Headers('x-vercel-oidc-token') oidc?: string) {
    this.ai.limit('health', 'ai', 5 * 24);
    const started = Date.now();
    try {
      const text = await this.ai.translate(oidc, 'The adventure is over but life goes on for an elf mage.', 'es');
      const rec = await this.ai.recommend(oidc, {
        lang: 'es', count: 2,
        profile: 'Favoritos: Frieren (10/10) [Adventure, Fantasy]; Mushishi (9/10) [Slice of Life, Supernatural]\nAbandonados: Highschool DxD [Ecchi]',
        candidates: [
          { anilist_id: 1, title: 'Natsume Yuujinchou', year: 2008, format: 'TV', episodes: 13, genres: ['Slice of Life', 'Supernatural'], score: 85, source: 'prueba' },
          { anilist_id: 2, title: 'Shinmai Maou no Testament', year: 2015, format: 'TV', episodes: 12, genres: ['Ecchi', 'Fantasy'], score: 60, source: 'prueba' },
          { anilist_id: 3, title: 'Made in Abyss', year: 2017, format: 'TV', episodes: 13, genres: ['Adventure', 'Fantasy'], score: 86, source: 'prueba' },
        ],
      });
      return { ok: rec.picks.length > 0, recommend: rec, provider: this.ai.provider, model: this.ai.modelId, ms: Date.now() - started, sample: text, groq_models: await groqModels() };
    } catch (e) {
      return { ok: false, provider: this.ai.provider, model: this.ai.modelId, error: (e as Error).message, groq_models: await groqModels() };
    }
  }

  /** Verifica la conexión con AniList (la búsqueda queda en caché 10 min). */
  @Get('anilist')
  async anilistCheck() {
    const [results, browse, filters] = await Promise.all([
      this.anilist.search('frieren'),
      this.anilist.browse({ genres: ['Fantasy'], tags: ['Magic'], year: 2023, season: 'FALL', formats: ['TV'], status: 'FINISHED' }),
      this.anilist.filterOptions(),
    ]);
    const byId = results[0] ? (await this.anilist.byIds([results[0].anilist_id])).get(results[0].anilist_id) : undefined;
    const details = results[0] ? await this.anilist.details(results[0].anilist_id) : undefined;
    const disc = results[0] ? await this.anilist.discover([results[0].anilist_id], [results[0].anilist_id]) : undefined;
    const fr = results[0] ? (await this.anilist.franchises([results[0].anilist_id])).get(results[0].anilist_id) : undefined;
    const mal = results[0]?.mal_id ? await this.anilist.byMalIds([results[0].mal_id]) : undefined;
    return {
      ok: results.length > 0 && browse.results.length > 0 && filters.genres.length > 0 && !!byId && !!details && !!disc && !!mal?.size && !!fr?.entries.length,
      franchise: fr ? { root: fr.root, entries: fr.entries.map((e) => `${e.label}: ${e.media.title}`) } : null,
      discover: disc ? { recommendations: disc.recommendations.length, sequels: disc.sequels.map((x) => x.media.title) } : null,
      mal: results[0]?.mal_id ? { mal_id: results[0].mal_id, back_to_anilist: mal?.get(results[0].mal_id)?.anilist_id ?? null } : null,
      details: details ? {
        studios: details.studios, duration: details.duration, relations: details.relations.length,
        tags: details.tags.length, description: details.description?.slice(0, 80) ?? null,
      } : null,
      byId: byId ? { title: byId.title, episodes: byId.total_episodes, aired: byId.aired_episodes, airing_status: byId.airing_status } : null,
      sample: results[0]?.title ?? null,
      browse: { total: browse.total, first: browse.results[0]?.title ?? null },
      filters: { genres: filters.genres.length, tags: filters.tags.length },
      media: await this.mediaCheck().catch((e) => ({ error: (e as Error).message })),
    };
  }

  /** Manga, novelas y filtros nuevos (duración, rango de capítulos y años). */
  private async mediaCheck() {
    const [manga, novel, short, mangaBrowse] = await Promise.all([
      this.anilist.search('berserk', 'manga'),
      this.anilist.search('mushoku tensei', 'novel'),
      this.anilist.browse({ media: 'anime', genres: ['Romance'], episodesMax: 13, yearFrom: 2018, sort: 'SCORE_DESC', perPage: 3 }),
      this.anilist.browse({ media: 'manga', genres: ['Mystery'], perPage: 3 }),
    ]);
    const det = await this.anilist.details(154587).catch(() => null);
    return {
      manga: manga.slice(0, 2).map((m) => `${m.title} [${m.media_type}] ${m.total_episodes ?? '?'} caps / ${m.total_volumes ?? '?'} vols`),
      novel: novel.slice(0, 2).map((m) => `${m.title} [${m.media_type}/${m.format}]`),
      short_romance: short.results.map((m) => `${m.title} (${m.total_episodes} caps, ${m.year}, ${m.duration} min)`),
      manga_browse: mangaBrowse.results.map((m) => `${m.title} [${m.media_type}]`),
      episode_titles: det ? det.episode_titles.slice(0, 2) : null,
      ok: manga[0]?.media_type === 'manga' && novel[0]?.media_type === 'novel' && short.results.length > 0
        && short.results.every((m) => (m.total_episodes ?? 0) <= 13),
    };
  }

  /** Prueba de la búsqueda en lenguaje natural (solo interpretación de filtros). Limitado. */
  @Get('ai-search')
  async aiSearchCheck(@Headers('x-vercel-oidc-token') oidc?: string) {
    this.ai.limit('health', 'ai-search', 48);
    const f = await this.anilist.filterOptions();
    const intent = await this.ai.searchIntent(oidc, 'algo como Frieren pero más corto y con romance', f.genres, f.tags.map((t) => t.name));
    return { ok: !!intent, intent, model: this.ai.modelId };
  }
}

/** Modelos de chat disponibles en la cuenta de Groq (para elegir AI_MODEL). */
async function groqModels(): Promise<string[] | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { data?: { id: string; active?: boolean }[] };
    return (body.data ?? []).filter((m) => m.active !== false).map((m) => m.id).sort();
  } catch {
    return null;
  }
}
