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
    const results = await this.anilist.search('frieren');
    return { ok: results.length > 0, sample: results[0]?.title ?? null };
  }
}
