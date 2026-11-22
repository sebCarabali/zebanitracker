import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AccessToken, UserId } from '../auth/current-user.decorator.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService, CatalogAnime } from '../anilist/anilist.service.js';
import { Anime, AnimesService } from '../animes/animes.service.js';
import { AiService, Candidate, LANGUAGES } from './ai.service.js';

class RecommendDto {
  /** Pedido puntual: "algo corto de misterio", "para ver con mi hermana"… */
  @IsOptional() @IsString() @MaxLength(300)
  request?: string;

  @IsOptional() @IsBoolean()
  refresh?: boolean;
}

interface StoredRecs {
  summary: string;
  request: string | null;
  items: { media: CatalogAnime; reason: string }[];
  generated_at: string;
  lang: string;
}

const RECS_TTL = 12 * 3600_000;

@Controller('ai')
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly supabase: SupabaseService,
    private readonly anilist: AniListService,
    private readonly animes: AnimesService,
  ) {}

  private async profile(token: string) {
    const { data } = await this.supabase.forUser(token).from('profiles')
      .select('language, ai_preferences, ai_recs, ai_recs_at').maybeSingle();
    const p = data as { language: string; ai_preferences: string | null; ai_recs: StoredRecs | null; ai_recs_at: string | null } | null;
    return { language: p?.language ?? 'es', preferences: p?.ai_preferences ?? null, recs: p?.ai_recs ?? null, recsAt: p?.ai_recs_at ?? null };
  }

  // -------------------------------------------------------------------------------------------
  // Traducción de sinopsis
  // -------------------------------------------------------------------------------------------

  /** Sinopsis traducida al idioma pedido (o al de tu perfil; español por defecto). Se guarda en caché. */
  @Get('description/:anilistId')
  async description(
    @AccessToken() token: string,
    @UserId() userId: string,
    @Param('anilistId', ParseIntPipe) anilistId: number,
    @Query('lang') langParam: string | undefined,
    @Headers('x-vercel-oidc-token') oidc?: string,
  ) {
    const lang = langParam && LANGUAGES[langParam] ? langParam : (await this.profile(token)).language;
    const details = await this.anilist.details(anilistId);
    const original = details.description;
    if (!original) return { lang, text: null, original: null, translated: false };
    if (lang === 'en') return { lang, text: original, original, translated: false }; // AniList ya está en inglés

    const db = this.supabase.forUser(token).from('ai_translations');
    const { data: hit } = await db.select('text').eq('anilist_id', anilistId).eq('lang', lang).maybeSingle();
    if (hit) return { lang, text: (hit as { text: string }).text, original, translated: true, cached: true };

    this.ai.limit(userId, 'translate', 150);
    const text = await this.ai.translate(oidc, original, lang);
    await db.upsert({ user_id: userId, anilist_id: anilistId, lang, text });
    return { lang, text, original, translated: true, cached: false };
  }

  // -------------------------------------------------------------------------------------------
  // Recomendaciones
  // -------------------------------------------------------------------------------------------

  /** Últimas recomendaciones guardadas (sin gastar IA). */
  @Get('recommendations')
  async cached(@AccessToken() token: string) {
    const p = await this.profile(token);
    if (!p.recs?.items) {
      // Aún no hay recomendaciones guardadas: respuesta vacía explícita (no "null", que llega como cuerpo vacío)
      return { summary: '', request: null, items: [], generated_at: null, lang: p.language, stale: true, empty: true };
    }
    const list = await this.animes.list(token, {});
    const inList = new Set(list.map((a) => a.anilist_id));
    return {
      ...p.recs,
      items: p.recs.items.filter((i) => !inList.has(i.media.anilist_id)),
      stale: !p.recsAt || Date.now() - new Date(p.recsAt).getTime() > RECS_TTL || p.recs.lang !== p.language,
    };
  }

  /** Genera recomendaciones personalizadas con IA según historial, puntuaciones y preferencias. */
  @Post('recommendations')
  async recommend(
    @AccessToken() token: string,
    @UserId() userId: string,
    @Body() dto: RecommendDto,
    @Headers('x-vercel-oidc-token') oidc?: string,
  ) {
    const p = await this.profile(token);
    const request = dto.request?.trim() || null;
    const fresh = p.recs && p.recsAt && Date.now() - new Date(p.recsAt).getTime() < RECS_TTL && p.recs.lang === p.language;
    if (!request && !dto.refresh && fresh) return this.cached(token);

    this.ai.limit(userId, 'recommend', 15);
    const list = await this.animes.list(token, {});
    const inList = new Set(list.map((a) => a.anilist_id).filter(Boolean) as number[]);
    const candidates = await this.candidates(token, list, inList);
    if (candidates.length < 3) {
      return { summary: '', request, items: [], generated_at: new Date().toISOString(), lang: p.language,
        note: 'Agrega o puntúa algunos animes para que la IA conozca tus gustos.' };
    }

    const result = await this.ai.recommend(oidc, {
      lang: p.language,
      profile: describeProfile(list, p.preferences),
      candidates: candidates.map((c) => c.candidate),
      request: request ?? undefined,
      count: 8,
    });
    const byId = new Map(candidates.map((c) => [c.candidate.anilist_id, c.media]));
    const stored: StoredRecs = {
      summary: result.summary,
      request,
      items: result.picks.map((pick) => ({ media: byId.get(pick.anilist_id)!, reason: pick.reason })),
      generated_at: new Date().toISOString(),
      lang: p.language,
    };
    // Solo las generales quedan guardadas; las de un pedido puntual no reemplazan "Para ti"
    if (!request) {
      await this.supabase.forUser(token).from('profiles')
        .upsert({ user_id: userId, ai_recs: stored, ai_recs_at: stored.generated_at });
    }
    return { ...stored, stale: false };
  }

  /** Candidatos reales de AniList: recomendaciones de la comunidad, mejor valorados en tus géneros y la temporada actual. */
  private async candidates(token: string, list: Anime[], inList: Set<number>) {
    const out = new Map<number, { candidate: Candidate; media: CatalogAnime }>();
    const add = (m: CatalogAnime, source: string) => {
      if (inList.has(m.anilist_id) || out.has(m.anilist_id) || out.size >= 70) return;
      out.set(m.anilist_id, {
        media: m,
        candidate: {
          anilist_id: m.anilist_id, title: m.title, year: m.year, format: m.format, episodes: m.total_episodes ?? m.aired_episodes,
          genres: m.genres, score: m.score, source,
        },
      });
    };

    const discover = await this.animes.discover(token).catch(() => ({ recommendations: [], sequels: [] }));
    for (const r of discover.recommendations) add(r.media, `la comunidad lo recomienda a quien vio ${r.because.slice(0, 2).join(' y ')}`);
    for (const s of discover.sequels) add(s.media, `secuela de ${s.after}`);

    const genres = topGenres(list).slice(0, 3);
    for (const g of genres) {
      const page = await this.anilist.browse({ genres: [g], sort: 'SCORE_DESC' }).catch(() => null);
      page?.results.forEach((m) => add(m, `de lo mejor valorado en ${g}`));
    }
    const month = new Date().getMonth();
    const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
    const current = await this.anilist.browse({ season, year: new Date().getFullYear(), sort: 'POPULARITY_DESC' }).catch(() => null);
    current?.results.slice(0, 12).forEach((m) => add(m, 'estreno de la temporada actual'));
    return [...out.values()];
  }
}

/** Géneros ponderados: capítulos vistos, favoritos y buenas puntuaciones suman; abandonos y notas bajas restan. */
function topGenres(list: Anime[]): string[] {
  const w = new Map<string, number>();
  for (const a of list) {
    let weight = Math.min(a.watched_episodes, 50) / 10 + (a.is_favorite ? 3 : 0) + (a.score ? (a.score - 5.5) : 0);
    if (a.status === 'dropped') weight -= 3;
    for (const g of a.genres) w.set(g, (w.get(g) ?? 0) + weight / Math.max(1, a.genres.length));
  }
  return [...w.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

/** Resumen compacto del historial para el modelo (sin notas ni reseñas privadas). */
function describeProfile(list: Anime[], preferences: string | null): string {
  const fmt = (a: Anime) => `${a.title}${a.score ? ` (${a.score}/10)` : ''}${a.genres.length ? ` [${a.genres.slice(0, 3).join(', ')}]` : ''}`;
  const by = (pred: (a: Anime) => boolean, n: number, sort?: (a: Anime, b: Anime) => number) =>
    list.filter(pred).sort(sort ?? ((a, b) => (b.last_watched_at ?? b.updated_at).localeCompare(a.last_watched_at ?? a.updated_at))).slice(0, n).map(fmt);
  const lines = [
    `Favoritos: ${by((a) => a.is_favorite, 12).join('; ') || 'ninguno'}`,
    `Mejor puntuados: ${by((a) => (a.score ?? 0) >= 8, 12, (a, b) => (b.score ?? 0) - (a.score ?? 0)).join('; ') || 'ninguno'}`,
    `Terminados recientes: ${by((a) => a.status === 'completed', 15).join('; ') || 'ninguno'}`,
    `Viendo ahora: ${by((a) => a.status === 'watching', 10).join('; ') || 'nada'}`,
    `Abandonados o mal puntuados (evitar algo parecido): ${by((a) => a.status === 'dropped' || (a.score ?? 10) <= 4, 10).join('; ') || 'ninguno'}`,
    `Géneros que más ve: ${topGenres(list).slice(0, 6).join(', ') || 'sin datos'}`,
  ];
  if (preferences) lines.push(`Preferencias que escribió el usuario: ${preferences}`);
  return lines.join('\n');
}
