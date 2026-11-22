import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService, AniListListStatus, CatalogAnime } from '../anilist/anilist.service.js';
import { AnimeStatus, CreateAnimeDto, ImportAniListDto, ListAnimesQuery, UpdateAnimeDto } from './dto/anime.dto.js';

export interface Anime {
  id: string;
  user_id: string;
  title: string;
  title_romaji: string | null;
  total_episodes: number | null;
  watched_episodes: number;
  status: AnimeStatus;
  is_favorite: boolean;
  cover_url: string | null;
  source_url: string | null;
  notes: string | null;
  score: number | null;
  review: string | null;
  anilist_id: number | null;
  mal_id: number | null;
  genres: string[];
  studios: string[];
  format: string | null;
  season_year: number | null;
  airing_status: string | null;
  aired_episodes: number | null;
  next_episode_at: string | null;
  episodes_synced_at: string | null;
  last_episode_url: string | null;
  franchise_id: number | null;
  season_number: number | null;
  franchise_synced_at: string | null;
  last_watched_at: string | null;
  completed_at: string | null;
  media_type: 'anime' | 'manga' | 'novel';
  total_volumes: number | null;
  watched_volumes: number;
  duration: number | null;
  priority: number | null;
  tags: string[];
  rewatching: boolean;
  reminder_snoozed_until: string | null;
  last_reminded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Rewatch { id: number; anime_id: string; finished_at: string; note: string | null }

/** Entrada a importar, venga de AniList o de MyAnimeList. */
interface ImportEntry {
  media: CatalogAnime;
  status: AnimeStatus;
  progress: number;
  score?: number | null;
  favorite?: boolean;
}

@Injectable()
export class AnimesService {
  private readonly logger = new Logger(AnimesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly anilist: AniListService,
  ) {}

  private table(token: string) {
    return this.supabase.forUser(token).from('animes');
  }

  private fail(error: PostgrestError): never {
    // 23514 = check_violation (p.ej. vistos > total)
    if (error.code === '23514') throw new BadRequestException('Los capítulos vistos no pueden superar el total');
    if (error.code === 'PGRST116') throw new NotFoundException('Anime no encontrado');
    if (error.code === '23505') throw new ConflictException('Ese anime ya está en tu lista');
    if (error.code === 'P0002') throw new NotFoundException(error.message);
    if (error.code === '22023') throw new BadRequestException(error.message);
    throw new BadRequestException(error.message);
  }

  async list(token: string, q: ListAnimesQuery): Promise<Anime[]> {
    let query = this.table(token).select('*').order('updated_at', { ascending: false });
    if (q.favorite) query = query.eq('is_favorite', true);
    if (q.status) query = query.eq('status', q.status);
    if (q.media) query = query.eq('media_type', q.media);
    if (q.tag) query = query.contains('tags', [q.tag]);
    if (q.search) query = query.ilike('title', `%${q.search.replace(/[%_]/g, '\\$&')}%`);
    const { data, error } = await query;
    if (error) this.fail(error);
    return data as Anime[];
  }

  async findOne(token: string, id: string): Promise<Anime> {
    const { data, error } = await this.table(token).select('*').eq('id', id).single();
    if (error) this.fail(error);
    return data as Anime;
  }

  async create(token: string, dto: CreateAnimeDto): Promise<Anime> {
    const row = this.normalize(dto);
    const { data, error } = await this.table(token).insert(row).select().single();
    if (error) this.fail(error);
    let created = data as Anime;
    // Completa capítulos y datos de emisión desde AniList; si AniList falla, el anime igual queda creado.
    try {
      await this.syncEpisodes(token, { ids: [created.id], force: true });
      created = await this.findOne(token, created.id);
    } catch { /* opcional */ }
    await this.pushToAniList(token, created);
    return created;
  }

  async update(token: string, id: string, dto: UpdateAnimeDto): Promise<Anime> {
    const current = await this.findOne(token, id);
    const row = this.normalize(dto, current);
    const { data, error } = await this.table(token).update(row).eq('id', id).select().single();
    if (error) this.fail(error);
    let updated = data as Anime;
    updated = await this.afterProgress(token, current, updated);
    const changed = updated.watched_episodes !== current.watched_episodes
      || updated.status !== current.status || updated.score !== current.score;
    if (changed) await this.pushToAniList(token, updated);
    return updated;
  }

  /** Si estabas en un rewatch y llegaste al final, lo registra y cierra el rewatch. */
  private async afterProgress(token: string, before: Pick<Anime, 'status'>, after: Anime): Promise<Anime> {
    if (!after.rewatching || after.status !== AnimeStatus.Completed || before.status === AnimeStatus.Completed) return after;
    const db = this.supabase.forUser(token);
    const { error } = await db.from('rewatches').insert({ anime_id: after.id, user_id: after.user_id });
    if (error) this.fail(error);
    const { data, error: upErr } = await this.table(token).update({ rewatching: false }).eq('id', after.id).select().single();
    if (upErr) this.fail(upErr);
    return data as Anime;
  }

  // ---------------------------------------------------------------------------------------------
  // Marcado por rango, rewatch, "Planeo ver" y recordatorios
  // ---------------------------------------------------------------------------------------------

  /** "Vi del 5 al 12": registra cada capítulo en el historial (cuenta para la racha) y avanza el progreso. */
  async markRange(token: string, id: string, from: number, to: number, watchedAt?: string): Promise<{ anime: Anime; logged: number }> {
    if (to < from) throw new BadRequestException('El capítulo final debe ser mayor o igual al inicial');
    const before = await this.findOne(token, id);
    const at = watchedAt ? new Date(watchedAt) : new Date();
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Fecha inválida');
    const { data, error } = await this.supabase.forUser(token).rpc('mark_episode_range', {
      p_anime: id, p_from: from, p_to: to, p_watched_at: at.toISOString(),
    });
    if (error) this.fail(error);
    let anime = await this.findOne(token, id);
    anime = await this.afterProgress(token, before, anime);
    if (anime.watched_episodes !== before.watched_episodes || anime.status !== before.status) await this.pushToAniList(token, anime);
    return { anime, logged: Number(data) || 0 };
  }

  /** Empieza a ver de nuevo: progreso a 0 y estado "viendo" (al terminar se suma al contador). */
  async startRewatch(token: string, id: string): Promise<Anime> {
    await this.findOne(token, id);
    const { data, error } = await this.table(token)
      .update({ watched_episodes: 0, watched_volumes: 0, status: AnimeStatus.Watching, rewatching: true })
      .eq('id', id).select().single();
    if (error) this.fail(error);
    await this.pushToAniList(token, data as Anime);
    return data as Anime;
  }

  async cancelRewatch(token: string, id: string): Promise<Anime> {
    const a = await this.findOne(token, id);
    const { data, error } = await this.table(token)
      .update({ rewatching: false, status: AnimeStatus.Completed, watched_episodes: a.total_episodes ?? a.watched_episodes })
      .eq('id', id).select().single();
    if (error) this.fail(error);
    return data as Anime;
  }

  async rewatches(token: string, id?: string): Promise<Rewatch[]> {
    let q = this.supabase.forUser(token).from('rewatches').select('id, anime_id, finished_at, note').order('finished_at', { ascending: false });
    if (id) q = q.eq('anime_id', id);
    const { data, error } = await q;
    if (error) this.fail(error);
    return data as Rewatch[];
  }

  /** Registra un rewatch pasado ("lo volví a ver en 2023"). */
  async addRewatch(token: string, userId: string, id: string, finishedAt?: string, note?: string): Promise<Rewatch> {
    await this.findOne(token, id);
    const { data, error } = await this.supabase.forUser(token).from('rewatches')
      .insert({ anime_id: id, user_id: userId, finished_at: finishedAt ? new Date(finishedAt).toISOString() : undefined, note: note || null })
      .select('id, anime_id, finished_at, note').single();
    if (error) this.fail(error);
    return data as Rewatch;
  }

  async removeRewatch(token: string, rewatchId: number) {
    const { error, count } = await this.supabase.forUser(token).from('rewatches').delete({ count: 'exact' }).eq('id', rewatchId);
    if (error) this.fail(error);
    if (!count) throw new NotFoundException('Rewatch no encontrado');
  }

  /** Guarda el orden de "Planeo ver" (arrastrar y soltar). */
  async reorder(token: string, ids: string[]) {
    await this.applyUpdates(token, ids.map((id, i) => ({ id, row: { priority: i } })));
    return { ok: true, count: ids.length };
  }

  /** Etiquetas usadas, con cuántos títulos tiene cada una. */
  async tags(token: string) {
    const { data, error } = await this.table(token).select('tags');
    if (error) this.fail(error);
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { tags: string[] }[]) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  private async staleWeeks(token: string): Promise<number> {
    const { data } = await this.supabase.forUser(token).from('profiles').select('stale_weeks').maybeSingle();
    return (data as { stale_weeks: number } | null)?.stale_weeks ?? 3;
  }

  /** Series en "viendo" sin avance hace más de N semanas (configurable en Ajustes), sin posponer. */
  async stale(token: string) {
    const weeks = await this.staleWeeks(token);
    const now = Date.now();
    const limit = now - weeks * 7 * 86_400_000;
    const rows = await this.list(token, { status: AnimeStatus.Watching });
    return {
      weeks,
      items: rows
        .filter((a) => new Date(a.last_watched_at ?? a.updated_at).getTime() < limit)
        .filter((a) => !a.reminder_snoozed_until || new Date(a.reminder_snoozed_until).getTime() < now)
        .map((a) => ({ ...a, idle_days: Math.floor((now - new Date(a.last_watched_at ?? a.updated_at).getTime()) / 86_400_000) }))
        .sort((a, b) => b.idle_days - a.idle_days),
    };
  }

  /** "¿Lo retomas o lo dejas?" — retomar/posponer silencia el aviso N semanas; dejar lo marca como abandonado. */
  async staleAction(token: string, id: string, action: 'resume' | 'drop' | 'snooze'): Promise<Anime> {
    const current = await this.findOne(token, id);
    if (action === 'drop') return this.update(token, id, { status: AnimeStatus.Dropped });
    const weeks = await this.staleWeeks(token);
    const { data, error } = await this.table(token)
      .update({ reminder_snoozed_until: new Date(Date.now() + weeks * 7 * 86_400_000).toISOString() })
      .eq('id', current.id).select().single();
    if (error) this.fail(error);
    return data as Anime;
  }

  async remove(token: string, id: string): Promise<void> {
    const { error, count } = await this.table(token).delete({ count: 'exact' }).eq('id', id);
    if (error) this.fail(error);
    if (!count) throw new NotFoundException('Anime no encontrado');
  }

  async toggleFavorite(token: string, id: string): Promise<Anime> {
    const current = await this.findOne(token, id);
    return this.update(token, id, { is_favorite: !current.is_favorite });
  }

  async setProgress(token: string, id: string, episode: number, url?: string): Promise<Anime> {
    return this.update(token, id, { watched_episodes: episode, ...(url ? { last_episode_url: url } : {}) });
  }

  async increment(token: string, id: string, delta: number): Promise<Anime> {
    const current = await this.findOne(token, id);
    const next = Math.max(0, current.watched_episodes + delta);
    return this.update(token, id, { watched_episodes: next });
  }

  // ---------------------------------------------------------------------------------------------
  // AniList: escritura en la lista del usuario (si conectó su cuenta)
  // ---------------------------------------------------------------------------------------------

  private async anilistToken(token: string): Promise<string | null> {
    const { data } = await this.supabase.forUser(token).from('profiles').select('anilist_token').maybeSingle();
    return (data as { anilist_token: string | null } | null)?.anilist_token ?? null;
  }

  /** Refleja progreso, estado y puntuación en AniList. Nunca hace fallar la operación local. */
  private async pushToAniList(token: string, a: Anime) {
    if (!a.anilist_id) return;
    try {
      const anilistToken = await this.anilistToken(token);
      if (!anilistToken) return;
      await this.anilist.saveListEntry(anilistToken, {
        mediaId: a.anilist_id,
        progress: a.watched_episodes,
        status: a.rewatching && a.status === AnimeStatus.Watching ? 'REPEATING' : TO_ANILIST_STATUS[a.status],
        score: a.score,
      });
    } catch (e) {
      this.logger.warn(`No se pudo sincronizar con AniList: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Importación (AniList y MyAnimeList) y exportación (MyAnimeList)
  // ---------------------------------------------------------------------------------------------

  /** Importa (o sincroniza) la lista pública de AniList de un usuario. */
  async importFromAniList(token: string, userId: string, dto: ImportAniListDto) {
    const [entries, favourites] = await Promise.all([
      this.anilist.userList(dto.username),
      dto.include_favorites === false ? Promise.resolve(new Set<number>()) : this.anilist.userFavourites(dto.username),
    ]);
    const wanted = dto.statuses?.length ? new Set<string>(dto.statuses) : null;
    const selected = entries.filter((e) => !wanted || wanted.has(e.status));
    const result = await this.importEntries(token, userId, selected.map((e) => ({
      media: e.media,
      status: STATUS_MAP[e.status],
      progress: e.progress,
      favorite: favourites.has(e.media.anilist_id),
    })));
    return { username: dto.username, found: entries.length, selected: selected.length, favorites: favourites.size, ...result };
  }

  /** Importa el XML que exporta MyAnimeList (Perfil › Export). */
  async importFromMal(token: string, userId: string, xml: string) {
    const items = parseMalXml(xml);
    if (!items.length) throw new BadRequestException('No se encontraron animes en el XML de MyAnimeList');
    const media = await this.anilist.byMalIds(items.map((i) => i.malId));
    const entries: ImportEntry[] = [];
    const missing: string[] = [];
    for (const it of items) {
      const m = media.get(it.malId);
      if (!m) { missing.push(it.title); continue; }
      entries.push({ media: m, status: it.status, progress: it.watched, score: it.score || null });
    }
    const result = await this.importEntries(token, userId, entries);
    return { found: items.length, selected: entries.length, not_found: missing.slice(0, 20), favorites: 0, ...result };
  }

  /**
   * Empareja por anilist_id y, si no, por título (animes agregados a mano).
   * Nunca retrocede el progreso local ni borra notas, reseñas, favoritos o el enlace propio.
   */
  private async importEntries(token: string, userId: string, entries: ImportEntry[]) {
    const { data: existingRows, error } = await this.table(token)
      .select('id, title, anilist_id, watched_episodes, is_favorite, score');
    if (error) this.fail(error);
    const existing = (existingRows ?? []) as Pick<Anime, 'id' | 'title' | 'anilist_id' | 'watched_episodes' | 'is_favorite' | 'score'>[];
    const byAniList = new Map(existing.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a]));
    const byTitle = new Map(existing.filter((a) => !a.anilist_id).map((a) => [normTitle(a.title), a]));

    const inserts: Record<string, unknown>[] = [];
    const updates: { id: string; row: Record<string, unknown> }[] = [];
    const seen = new Set<number>();

    for (const e of entries) {
      const m = e.media;
      if (seen.has(m.anilist_id)) continue;
      seen.add(m.anilist_id);
      const local =
        byAniList.get(m.anilist_id) ??
        byTitle.get(normTitle(m.title)) ??
        (m.title_romaji ? byTitle.get(normTitle(m.title_romaji)) : undefined);

      const total = m.total_episodes;
      let status = e.status;
      let watched = Math.max(e.progress, local?.watched_episodes ?? 0);
      if (status === AnimeStatus.Completed && total !== null) watched = total;
      if (total !== null) watched = Math.min(watched, total);
      if (total !== null && total > 0 && watched === total) status = AnimeStatus.Completed;

      const common = {
        anilist_id: m.anilist_id,
        total_episodes: total,
        watched_episodes: watched,
        status,
        cover_url: m.cover_url,
        is_favorite: (local?.is_favorite ?? false) || !!e.favorite,
        ...(local?.score ? {} : e.score ? { score: Math.min(10, Math.max(1, Math.round(e.score))) } : {}),
        ...metadataFields(m),
      };

      if (local) {
        updates.push({ id: local.id, row: common });
        byTitle.delete(normTitle(local.title));
      } else {
        inserts.push({ ...common, user_id: userId, title: m.title, source_url: m.site_url });
      }
    }

    for (let i = 0; i < inserts.length; i += 200) {
      const { error: insErr } = await this.table(token).insert(inserts.slice(i, i + 200));
      if (insErr) this.fail(insErr);
    }
    await this.applyUpdates(token, updates);
    return { created: inserts.length, updated: updates.length };
  }

  /** XML compatible con la importación de MyAnimeList. */
  async exportMal(token: string): Promise<{ xml: string; exported: number; skipped: number }> {
    const rows = await this.list(token, {});
    const withMal = rows.filter((a) => a.mal_id);
    const esc = (s: string) => s.replace(/]]>/g, ']]]]><![CDATA[>');
    const entries = withMal.map((a) => `  <anime>
    <series_animedb_id>${a.mal_id}</series_animedb_id>
    <series_title><![CDATA[${esc(a.title)}]]></series_title>
    <series_episodes>${a.total_episodes ?? 0}</series_episodes>
    <my_watched_episodes>${a.watched_episodes}</my_watched_episodes>
    <my_score>${a.score ?? 0}</my_score>
    <my_status>${TO_MAL_STATUS[a.status]}</my_status>
    <my_comments><![CDATA[${esc(a.review ?? '')}]]></my_comments>
    <update_on_import>1</update_on_import>
  </anime>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_export_type>1</user_export_type>
    <user_total_anime>${withMal.length}</user_total_anime>
  </myinfo>
${entries}
</myanimelist>
`;
    return { xml, exported: withMal.length, skipped: rows.length - withMal.length };
  }

  // ---------------------------------------------------------------------------------------------
  // Actividad y descubrimiento
  // ---------------------------------------------------------------------------------------------

  /** Capítulos marcados en los últimos `days` días. */
  async activity(token: string, days: number) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await this.supabase.forUser(token).from('watch_events')
      .select('anime_id, episode, watched_at').gte('watched_at', since).order('watched_at', { ascending: false }).limit(5000);
    if (error) this.fail(error);
    return data as { anime_id: string; episode: number; watched_at: string }[];
  }

  /** Recomendaciones según favoritos/mejor puntuados y secuelas de lo que terminaste. */
  async discover(token: string) {
    const rows = await this.list(token, {});
    const inList = new Set(rows.map((a) => a.anilist_id).filter(Boolean) as number[]);
    const linked = rows.filter((a) => a.anilist_id);
    const seeds = [
      ...linked.filter((a) => a.is_favorite || (a.score ?? 0) >= 8),
      ...linked.filter((a) => a.status === 'watching' || a.status === 'completed')
        .sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? '')),
    ];
    const seedIds = [...new Set(seeds.map((a) => a.anilist_id!))].slice(0, 6);
    const completedIds = linked.filter((a) => a.status === 'completed')
      .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at))
      .map((a) => a.anilist_id!).slice(0, 40);
    const { recommendations, sequels } = await this.anilist.discover(seedIds, completedIds);
    return {
      recommendations: recommendations.filter((r) => !inList.has(r.media.anilist_id)).slice(0, 12),
      sequels: sequels.filter((s) => !inList.has(s.media.anilist_id)),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Sincronización de capítulos y metadatos desde AniList
  // ---------------------------------------------------------------------------------------------

  /**
   * Completa total de capítulos, emisión y metadatos (géneros, estudio, formato, año, MAL) desde AniList.
   * - Vinculados: una petición por cada 50. Sin vincular y sin total: busca por título exacto (máx. 5).
   * - Sin `force`: en emisión cada 6 h, el resto cada 7 días; los que no tienen metadatos, siempre.
   */
  async syncEpisodes(token: string, opts: { ids?: string[]; force?: boolean } = {}) {
    let query = this.table(token).select(
      'id, title, title_romaji, anilist_id, total_episodes, watched_episodes, cover_url, airing_status, episodes_synced_at, format, media_type, duration',
    );
    if (opts.ids?.length) query = query.in('id', opts.ids);
    const { data, error } = await query;
    if (error) this.fail(error);
    const rows = (data ?? []) as Anime[];

    const now = Date.now();
    const stale = (a: Anime) => {
      if (opts.force || !a.episodes_synced_at) return true;
      if (a.anilist_id && (!a.format || !a.title_romaji)) return true; // aún sin metadatos (géneros, romaji…)
      // Sin duración por capítulo (necesaria para calcular el tiempo de "Planeo ver"): reintenta cada hora
      if (a.anilist_id && a.media_type === 'anime' && a.duration === null && a.format !== 'MUSIC'
        && now - new Date(a.episodes_synced_at).getTime() > 3600_000) return true;
      const age = now - new Date(a.episodes_synced_at).getTime();
      return age > (a.airing_status === 'RELEASING' || a.airing_status === 'NOT_YET_RELEASED' ? 6 : 7 * 24) * 3600_000;
    };
    const candidates = rows.filter(stale);
    const usedIds = new Set(rows.map((a) => a.anilist_id).filter(Boolean));

    const newLinks = new Map<string, number>();
    const unlinked = candidates.filter((a) => !a.anilist_id && a.total_episodes === null).slice(0, 5);
    for (const a of unlinked) {
      const results = await this.anilist.search(a.title, a.media_type ?? 'anime');
      const t = normTitle(a.title);
      const hit = results.find(
        (r) => [r.title, r.title_romaji, r.title_english].some((x) => x && normTitle(x) === t) && !usedIds.has(r.anilist_id),
      );
      if (hit) {
        newLinks.set(a.id, hit.anilist_id);
        usedIds.add(hit.anilist_id);
      }
    }

    const toFetch = candidates.filter((a) => a.anilist_id || newLinks.has(a.id));
    const media = await this.anilist.byIds(toFetch.map((a) => (a.anilist_id ?? newLinks.get(a.id))!));
    const syncedAt = new Date().toISOString();

    const updates: { id: string; row: Record<string, unknown> }[] = [];
    for (const a of candidates) {
      const anilistId = a.anilist_id ?? newLinks.get(a.id);
      const m = anilistId ? media.get(anilistId) : undefined;
      if (!m) {
        updates.push({ id: a.id, row: { episodes_synced_at: syncedAt } });
        continue;
      }
      const row: Record<string, unknown> = { ...metadataFields(m), episodes_synced_at: syncedAt };
      if (!a.anilist_id) row.anilist_id = anilistId;
      if (!a.cover_url && m.cover_url) row.cover_url = m.cover_url;
      if (m.total_episodes !== null && m.total_episodes >= a.watched_episodes && m.total_episodes !== a.total_episodes) {
        row.total_episodes = m.total_episodes;
      }
      updates.push({ id: a.id, row });
    }
    await this.applyUpdates(token, updates);

    let seasons = 0;
    try {
      seasons = await this.syncFranchises(token, { ids: opts.ids, force: opts.force });
    } catch (e) {
      this.logger.warn(`No se pudieron calcular temporadas: ${(e as Error).message}`);
    }

    return {
      checked: candidates.length,
      updated: updates.filter((u) => Object.keys(u.row).length > 1).length + seasons,
      linked: newLinks.size,
    };
  }

  /**
   * Completa franchise_id (primera entrega) y season_number de los animes vinculados.
   * Máximo 60 por llamada; se recalcula cada 30 días (por si se anuncian temporadas nuevas).
   */
  async syncFranchises(token: string, opts: { ids?: string[]; force?: boolean } = {}): Promise<number> {
    let query = this.table(token).select('id, anilist_id, franchise_id, season_number, franchise_synced_at')
      .not('anilist_id', 'is', null).eq('media_type', 'anime');
    if (opts.ids?.length) query = query.in('id', opts.ids);
    const { data, error } = await query;
    if (error) this.fail(error);
    const month = 30 * 24 * 3600_000;
    const rows = ((data ?? []) as Anime[])
      .filter((a) => opts.force || !a.franchise_synced_at || Date.now() - new Date(a.franchise_synced_at).getTime() > month)
      .slice(0, 60);
    if (!rows.length) return 0;

    const franchises = await this.anilist.franchises(rows.map((a) => a.anilist_id!));
    const now = new Date().toISOString();
    const updates = rows.map((a) => {
      const f = franchises.get(a.anilist_id!);
      const entry = f?.entries.find((e) => e.media.anilist_id === a.anilist_id);
      return {
        id: a.id,
        row: { franchise_id: f?.root ?? a.anilist_id, season_number: entry?.season_number ?? null, franchise_synced_at: now },
      };
    });
    await this.applyUpdates(token, updates);
    return updates.filter((u, i) => u.row.franchise_id !== rows[i].franchise_id || u.row.season_number !== rows[i].season_number).length;
  }

  /** Agrega varios animes del catálogo de una vez (p. ej. todas las temporadas que faltan). */
  async addMany(token: string, userId: string, items: { anilist_id: number; status: AnimeStatus }[]) {
    const { data: existing, error } = await this.table(token).select('anilist_id').not('anilist_id', 'is', null);
    if (error) this.fail(error);
    const have = new Set((existing ?? []).map((r) => (r as { anilist_id: number }).anilist_id));
    const wanted = items.filter((i) => !have.has(i.anilist_id));
    if (!wanted.length) return [];

    const [media, franchises] = await Promise.all([
      this.anilist.byIds(wanted.map((i) => i.anilist_id)),
      this.anilist.franchises(wanted.map((i) => i.anilist_id)).catch(() => new Map()),
    ]);
    const now = new Date().toISOString();
    const rows = wanted.flatMap((i) => {
      const m = media.get(i.anilist_id);
      if (!m) return [];
      const f = franchises.get(i.anilist_id);
      const entry = f?.entries.find((e: { media: CatalogAnime }) => e.media.anilist_id === i.anilist_id);
      return [{
        user_id: userId, title: m.title, anilist_id: m.anilist_id, total_episodes: m.total_episodes,
        watched_episodes: i.status === AnimeStatus.Completed && m.total_episodes ? m.total_episodes : 0,
        total_volumes: m.total_volumes,
        status: i.status, cover_url: m.cover_url, source_url: m.site_url,
        ...metadataFields(m),
        franchise_id: f?.root ?? m.anilist_id, season_number: entry?.season_number ?? null, franchise_synced_at: now,
      }];
    });
    const { data, error: insErr } = await this.table(token).insert(rows).select();
    if (insErr) this.fail(insErr);
    return data as Anime[];
  }

  private async applyUpdates(token: string, updates: { id: string; row: Record<string, unknown> }[]) {
    for (let i = 0; i < updates.length; i += 10) {
      const results = await Promise.all(
        updates.slice(i, i + 10).map((u) => this.table(token).update(u.row).eq('id', u.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) this.fail(failed.error);
    }
  }

  /**
   * Reglas de negocio:
   * - vistos <= total
   * - marcar "completed" sin tocar el progreso rellena todos los capítulos
   * - llegar al último capítulo marca "completed"; avanzar desde plan/completed vuelve a "watching"
   */
  private normalize(patch: UpdateAnimeDto, current?: Anime) {
    const merged = { ...current, ...patch };
    const total = merged.total_episodes ?? null;
    let watched = merged.watched_episodes ?? 0;
    let status = merged.status ?? AnimeStatus.Watching;

    if (patch.status === AnimeStatus.Completed && patch.watched_episodes === undefined && total !== null) {
      watched = total;
    } else if (patch.watched_episodes !== undefined && patch.watched_episodes !== current?.watched_episodes) {
      if (total !== null && total > 0 && watched === total) status = AnimeStatus.Completed;
      else if (watched > 0 && (status === AnimeStatus.PlanToWatch || status === AnimeStatus.Completed)) {
        status = AnimeStatus.Watching;
      }
    }
    if (total !== null && watched > total) {
      throw new BadRequestException(`El anime tiene ${total} capítulos; no puedes marcar el ${watched}`);
    }

    const progressChanged = watched !== (current?.watched_episodes ?? 0);
    return {
      title: merged.title?.trim(),
      total_episodes: total,
      watched_episodes: watched,
      status,
      is_favorite: merged.is_favorite ?? false,
      cover_url: merged.cover_url || null,
      source_url: merged.source_url || null,
      notes: merged.notes || null,
      score: merged.score ?? null,
      review: merged.review || null,
      last_episode_url: merged.last_episode_url || null,
      anilist_id: merged.anilist_id ?? null,
      media_type: merged.media_type ?? 'anime',
      total_volumes: merged.total_volumes ?? null,
      watched_volumes: Math.max(0, merged.watched_volumes ?? 0),
      tags: cleanTags(merged.tags ?? []),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      // Avanzar una serie reinicia el aviso de "¿la retomas o la dejas?"
      ...(progressChanged ? { reminder_snoozed_until: null } : {}),
      ...(progressChanged && watched > 0 ? { last_watched_at: new Date().toISOString() } : {}),
    };
  }
}

const STATUS_MAP: Record<AniListListStatus, AnimeStatus> = {
  CURRENT: AnimeStatus.Watching,
  REPEATING: AnimeStatus.Watching,
  PLANNING: AnimeStatus.PlanToWatch,
  COMPLETED: AnimeStatus.Completed,
  PAUSED: AnimeStatus.OnHold,
  DROPPED: AnimeStatus.Dropped,
};

const TO_ANILIST_STATUS: Record<AnimeStatus, string> = {
  watching: 'CURRENT',
  completed: 'COMPLETED',
  plan_to_watch: 'PLANNING',
  on_hold: 'PAUSED',
  dropped: 'DROPPED',
};

const TO_MAL_STATUS: Record<AnimeStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  plan_to_watch: 'Plan to Watch',
  on_hold: 'On-Hold',
  dropped: 'Dropped',
};

const FROM_MAL_STATUS: Record<string, AnimeStatus> = {
  watching: AnimeStatus.Watching, '1': AnimeStatus.Watching,
  completed: AnimeStatus.Completed, '2': AnimeStatus.Completed,
  'on-hold': AnimeStatus.OnHold, '3': AnimeStatus.OnHold,
  dropped: AnimeStatus.Dropped, '4': AnimeStatus.Dropped,
  'plan to watch': AnimeStatus.PlanToWatch, '6': AnimeStatus.PlanToWatch,
};

function normTitle(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/** Etiquetas sin espacios sobrantes, sin repetir (sin distinguir mayúsculas), máx. 20. */
function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, 20);
}

function metadataFields(m: CatalogAnime) {
  return {
    media_type: m.media_type,
    duration: m.duration,
    ...(m.total_volumes !== null ? { total_volumes: m.total_volumes } : {}),
    airing_status: m.airing_status,
    aired_episodes: m.aired_episodes,
    next_episode_at: m.next_episode_at,
    genres: m.genres,
    studios: m.studios,
    format: m.format,
    season_year: m.year,
    mal_id: m.mal_id,
    title_romaji: m.title_romaji,
    episodes_synced_at: new Date().toISOString(),
  };
}

/** Lector mínimo del XML de MyAnimeList (no ejecuta entidades externas: solo expresiones regulares). */
export function parseMalXml(xml: string) {
  const field = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${name}>`));
    return (m?.[1] ?? m?.[2] ?? '').trim();
  };
  const out: { malId: number; title: string; watched: number; score: number; status: AnimeStatus }[] = [];
  for (const block of xml.match(/<anime>[\s\S]*?<\/anime>/g) ?? []) {
    const malId = Number(field(block, 'series_animedb_id'));
    if (!malId) continue;
    out.push({
      malId,
      title: field(block, 'series_title'),
      watched: Number(field(block, 'my_watched_episodes')) || 0,
      score: Number(field(block, 'my_score')) || 0,
      status: FROM_MAL_STATUS[field(block, 'my_status').toLowerCase()] ?? AnimeStatus.PlanToWatch,
    });
  }
  return out;
}
