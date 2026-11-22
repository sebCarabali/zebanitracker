import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AccessToken, UserId } from '../auth/current-user.decorator.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService, CatalogAnime, MediaKind } from '../anilist/anilist.service.js';
import { AnimesService } from '../animes/animes.service.js';
import { AiService, Candidate, LANGUAGES, SearchIntent } from './ai.service.js';
import { AiCacheService } from './ai-cache.service.js';
import { describeMonth, monthlyStats } from './monthly.js';

class NaturalSearchDto {
  @IsString() @Length(3, 300)
  query: string;

  /** Si se elige en la interfaz, manda sobre lo que deduzca la IA. */
  @IsOptional() @IsEnum(['anime', 'manga', 'novel'])
  media?: MediaKind;
}

const DAY = 86_400_000;

@Controller('ai')
@UseGuards(SupabaseAuthGuard)
export class AiExtraController {
  constructor(
    private readonly ai: AiService,
    private readonly cache: AiCacheService,
    private readonly supabase: SupabaseService,
    private readonly anilist: AniListService,
    private readonly animes: AnimesService,
  ) {}

  private async language(token: string, param?: string) {
    if (param && LANGUAGES[param]) return param;
    const { data } = await this.supabase.forUser(token).from('profiles').select('language').maybeSingle();
    return (data as { language: string } | null)?.language ?? 'es';
  }

  // -------------------------------------------------------------------------------------------
  // Búsqueda en lenguaje natural
  // -------------------------------------------------------------------------------------------

  /** "algo como Frieren pero más corto y con romance" → filtros de AniList + orden semántico con IA. */
  @Post('search')
  async search(@AccessToken() token: string, @UserId() userId: string, @Body() dto: NaturalSearchDto,
    @Headers('x-vercel-oidc-token') oidc?: string) {
    const lang = await this.language(token);
    const query = dto.query.trim();
    const key = `search:${lang}:${dto.media ?? ''}:${query.toLowerCase().replace(/\s+/g, ' ')}`;

    const { value, cached } = await this.cache.get(key, 6 * 3600_000, async () => {
      this.ai.limit(userId, 'search', 40);
      const options = await this.anilist.filterOptions();
      const intent = (await this.ai.searchIntent(oidc, query, options.genres, options.tags.map((t) => t.name))) ?? {};
      const genreSet = new Set(options.genres);
      const tagSet = new Set(options.tags.map((t) => t.name));
      const f: SearchIntent = {
        ...intent,
        media: dto.media ?? intent.media ?? 'anime',
        genres: (intent.genres ?? []).filter((g) => genreSet.has(g)),
        exclude_genres: (intent.exclude_genres ?? []).filter((g) => genreSet.has(g)),
        tags: (intent.tags ?? []).filter((t) => tagSet.has(t)),
      };
      const media = f.media as MediaKind;
      const validFormats = media === 'anime' ? ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'] : media === 'manga' ? ['MANGA', 'ONE_SHOT'] : [];
      const formats = (f.formats ?? []).filter((x) => validFormats.includes(x));

      const pool = new Map<number, { media: CatalogAnime; source: string }>();
      const add = (m: CatalogAnime, source: string) => { if (!pool.has(m.anilist_id) && pool.size < 60) pool.set(m.anilist_id, { media: m, source }); };

      // 1) Obras de referencia: sus recomendaciones de la comunidad
      const refs: CatalogAnime[] = [];
      for (const title of (f.similar_to ?? []).slice(0, 2)) {
        const hit = (await this.anilist.search(title, media).catch(() => []))[0];
        if (hit) refs.push(hit);
      }
      if (refs.length) {
        const d = await this.anilist.discover(refs.map((r) => r.anilist_id), []).catch(() => null);
        d?.recommendations.forEach((r: { media: CatalogAnime; because: string[] }) => add(r.media, `recomendado a quien vio ${r.because.join(' y ')}`));
      }
      // 2) Filtros; si quedan muy pocos resultados se relajan
      const base = {
        media, search: f.search ?? undefined, genres: f.genres ?? undefined, excludeGenres: f.exclude_genres ?? undefined,
        tags: f.tags?.slice(0, 3), formats, status: f.status ?? undefined, yearFrom: f.year_from ?? undefined, yearTo: f.year_to ?? undefined,
        episodesMin: f.episodes_min ?? undefined, episodesMax: f.episodes_max ?? undefined, minScore: f.min_score ?? undefined,
        sort: f.sort ?? (f.search ? undefined : 'SCORE_DESC'), perPage: 30,
      };
      const strict = await this.anilist.browse(base).catch(() => null);
      strict?.results.forEach((m) => add(m, 'cumple los filtros'));
      if ((strict?.results.length ?? 0) < 8) {
        const relaxed = await this.anilist.browse({ ...base, tags: undefined, genres: base.genres?.slice(0, 1), minScore: undefined }).catch(() => null);
        relaxed?.results.forEach((m) => add(m, 'cumple parte de los filtros'));
      }
      // Las referencias no se recomiendan a sí mismas
      refs.forEach((r) => pool.delete(r.anilist_id));

      // Para la búsqueda semántica, filtra a mano lo que AniList no aplicó a las recomendaciones
      const fits = (m: CatalogAnime) => {
        const n = m.total_episodes ?? m.aired_episodes;
        if (f.episodes_max && n && n > f.episodes_max + 2) return false;
        if (f.episodes_min && n && n < f.episodes_min) return false;
        if (f.exclude_genres?.some((g) => m.genres.includes(g))) return false;
        if (m.media_type !== media) return false;
        return true;
      };
      const entries = [...pool.values()].filter((e) => fits(e.media));
      const candidates: Candidate[] = entries.map(({ media: m, source }) => ({
        anilist_id: m.anilist_id, title: m.title, year: m.year, format: m.format, episodes: m.total_episodes ?? m.aired_episodes,
        genres: m.genres, score: m.score, source,
      }));
      let picks: { anilist_id: number; reason: string }[] = [];
      if (candidates.length) picks = await this.ai.rankSearch(oidc, { query, lang, candidates, count: 12 });
      if (!picks.length) picks = candidates.slice(0, 12).map((c) => ({ anilist_id: c.anilist_id, reason: '' }));
      const byId = new Map(entries.map((e) => [e.media.anilist_id, e.media]));
      return {
        query,
        interpretation: f.explanation ?? null,
        filters: { ...base, similar_to: refs.map((r) => r.title) },
        items: picks.map((p) => ({ media: byId.get(p.anilist_id)!, reason: p.reason })).filter((i) => i.media),
      };
    });

    // Marca lo que ya está en tu lista (sin cachear por usuario)
    const list = await this.animes.list(token, {});
    const mine = new Map(list.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a.id]));
    const v = value ?? { query, interpretation: null, filters: {}, items: [] };
    return { ...v, cached, items: v.items.map((i) => ({ ...i, in_list: mine.get(i.media.anilist_id) ?? null })) };
  }

  // -------------------------------------------------------------------------------------------
  // "¿En qué iba?" — resumen sin spoilers
  // -------------------------------------------------------------------------------------------

  @Get('recap/:animeId')
  async recap(@AccessToken() token: string, @UserId() userId: string, @Param('animeId', ParseUUIDPipe) animeId: string,
    @Query('episode') episodeParam?: string, @Query('lang') langParam?: string, @Headers('x-vercel-oidc-token') oidc?: string) {
    const anime = await this.animes.findOne(token, animeId);
    const episode = episodeParam ? Number(episodeParam) : anime.watched_episodes;
    if (!Number.isInteger(episode) || episode < 1) {
      throw new BadRequestException('Marca al menos un capítulo visto para generar el resumen');
    }
    if (anime.total_episodes !== null && episode > anime.total_episodes) throw new BadRequestException('Capítulo fuera de rango');
    const lang = await this.language(token, langParam);
    const details = anime.anilist_id ? await this.anilist.details(anime.anilist_id).catch(() => null) : null;
    const key = `recap:${anime.anilist_id ?? `t:${anime.title.toLowerCase().slice(0, 80)}`}:${episode}:${lang}`;

    const { value, cached } = await this.cache.get(key, 90 * DAY, async () => {
      this.ai.limit(userId, 'recap', 30);
      return this.ai.recap(oidc, {
        lang,
        title: details?.title_romaji && details.title_romaji !== anime.title ? `${anime.title} (${details.title_romaji})` : anime.title,
        mediaType: anime.media_type,
        episode,
        total: anime.total_episodes,
        synopsis: details?.description ?? null,
        // Solo los títulos de capítulos ya vistos (nunca los siguientes)
        episodeTitles: (details?.episode_titles ?? []).slice(0, episode).map((t) => t.replace(/^Episode \d+\s*-\s*/i, '')),
      });
    });
    if (!value) throw new BadRequestException('La IA no pudo generar el resumen. Intenta de nuevo.');
    return { anime_id: anime.id, title: anime.title, episode, lang, cached, ...value };
  }

  // -------------------------------------------------------------------------------------------
  // Resumen del mes
  // -------------------------------------------------------------------------------------------

  /** Estadísticas del mes + resumen divertido con IA (`ai=0` para solo las cifras). */
  @Get('monthly')
  async monthly(@AccessToken() token: string, @UserId() userId: string, @Query('month') monthParam?: string,
    @Query('ai') aiParam?: string, @Query('tz') tzParam?: string, @Headers('x-vercel-oidc-token') oidc?: string) {
    const now = new Date();
    const month = monthParam ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Mes inválido (usa AAAA-MM)');
    const tz = tzParam !== undefined && /^-?\d{1,4}$/.test(tzParam) ? Math.max(-840, Math.min(840, Number(tzParam))) : -300;
    const stats = await monthlyStats(this.supabase.forUser(token), month, { tzOffsetMin: tz });
    if (aiParam === '0' || stats.episodes === 0) return { stats, ai: null };

    const lang = await this.language(token);
    const current = month === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    // El mes en curso cambia: la clave incluye el número de capítulos (se regenera al ver más)
    const key = `monthly:${userId}:${month}:${lang}:${current ? stats.episodes : 'final'}`;
    const { value, cached } = await this.cache.get(key, current ? 7 * DAY : 365 * DAY, async () => {
      this.ai.limit(userId, 'monthly', 10);
      return this.ai.monthly(oidc, { lang, month, stats: describeMonth(stats) });
    });
    return { stats, ai: value, cached };
  }
}
