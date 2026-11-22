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
      return { ok: true, model: this.ai.modelId, ms: Date.now() - started, sample: text, auth: process.env.AI_GATEWAY_API_KEY ? 'api-key' : oidc ? 'oidc' : 'none' };
    } catch (e) {
      return { ok: false, model: this.ai.modelId, error: (e as Error).message, auth: process.env.AI_GATEWAY_API_KEY ? 'api-key' : oidc ? 'oidc' : 'none' };
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
    };
  }
}
