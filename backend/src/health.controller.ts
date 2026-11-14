import { Controller, Get } from '@nestjs/common';
import { AniListService } from './anilist/anilist.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly anilist: AniListService) {}

  @Get()
  check() {
    return { ok: true };
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
    return {
      ok: results.length > 0 && browse.results.length > 0 && filters.genres.length > 0 && !!byId && !!details,
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
