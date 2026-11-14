import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AniListService, AniListListStatus, CatalogAnime } from '../anilist/anilist.service.js';
import { AnimeStatus, CreateAnimeDto, ImportAniListDto, ListAnimesQuery, UpdateAnimeDto } from './dto/anime.dto.js';

export interface Anime {
  id: string;
  user_id: string;
  title: string;
  total_episodes: number | null;
  watched_episodes: number;
  status: AnimeStatus;
  is_favorite: boolean;
  cover_url: string | null;
  source_url: string | null;
  notes: string | null;
  anilist_id: number | null;
  airing_status: string | null;
  aired_episodes: number | null;
  next_episode_at: string | null;
  episodes_synced_at: string | null;
  last_watched_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AnimesService {
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
    throw new BadRequestException(error.message);
  }

  async list(token: string, q: ListAnimesQuery): Promise<Anime[]> {
    let query = this.table(token).select('*').order('updated_at', { ascending: false });
    if (q.favorite) query = query.eq('is_favorite', true);
    if (q.status) query = query.eq('status', q.status);
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
    const created = data as Anime;
    // Completa capítulos y datos de emisión desde AniList; si AniList falla, el anime igual queda creado.
    try {
      await this.syncEpisodes(token, { ids: [created.id], force: true });
      return await this.findOne(token, created.id);
    } catch {
      return created;
    }
  }

  async update(token: string, id: string, dto: UpdateAnimeDto): Promise<Anime> {
    const current = await this.findOne(token, id);
    const row = this.normalize(dto, current);
    const { data, error } = await this.table(token).update(row).eq('id', id).select().single();
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

  async setProgress(token: string, id: string, episode: number): Promise<Anime> {
    return this.update(token, id, { watched_episodes: episode });
  }

  async increment(token: string, id: string, delta: number): Promise<Anime> {
    const current = await this.findOne(token, id);
    const next = Math.max(0, current.watched_episodes + delta);
    return this.update(token, id, { watched_episodes: next });
  }

  /**
   * Importa (o sincroniza) la lista pública de AniList de un usuario.
   * - Empareja por anilist_id y, si no, por título normalizado (animes agregados a mano).
   * - Nunca retrocede el progreso local ni borra notas, favoritos o el enlace propio.
   */
  async importFromAniList(token: string, userId: string, dto: ImportAniListDto) {
    const [entries, favourites] = await Promise.all([
      this.anilist.userList(dto.username),
      dto.include_favorites === false ? Promise.resolve(new Set<number>()) : this.anilist.userFavourites(dto.username),
    ]);
    const wanted = dto.statuses?.length ? new Set<string>(dto.statuses) : null;
    const selected = entries.filter((e) => !wanted || wanted.has(e.status));

    const { data: existingRows, error } = await this.table(token)
      .select('id, title, anilist_id, watched_episodes, is_favorite');
    if (error) this.fail(error);
    const existing = (existingRows ?? []) as Pick<Anime, 'id' | 'title' | 'anilist_id' | 'watched_episodes' | 'is_favorite'>[];
    const byAniList = new Map(existing.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a]));
    const byTitle = new Map(existing.filter((a) => !a.anilist_id).map((a) => [normTitle(a.title), a]));

    const inserts: Record<string, unknown>[] = [];
    const updates: { id: string; row: Record<string, unknown> }[] = [];

    for (const e of selected) {
      const m = e.media;
      const local =
        byAniList.get(m.anilist_id) ??
        byTitle.get(normTitle(m.title)) ??
        (m.title_romaji ? byTitle.get(normTitle(m.title_romaji)) : undefined);

      const total = m.total_episodes;
      let status = STATUS_MAP[e.status];
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
        is_favorite: (local?.is_favorite ?? false) || favourites.has(m.anilist_id),
        ...airingFields(m),
      };

      if (local) {
        updates.push({ id: local.id, row: common });
        byTitle.delete(normTitle(local.title)); // evita emparejar dos entradas con el mismo anime local
      } else {
        inserts.push({ ...common, user_id: userId, title: m.title, source_url: m.site_url });
      }
    }

    for (let i = 0; i < inserts.length; i += 200) {
      const { error: insErr } = await this.table(token).insert(inserts.slice(i, i + 200));
      if (insErr) this.fail(insErr);
    }
    for (let i = 0; i < updates.length; i += 10) {
      const results = await Promise.all(
        updates.slice(i, i + 10).map((u) => this.table(token).update(u.row).eq('id', u.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) this.fail(failed.error);
    }

    return {
      username: dto.username,
      found: entries.length,
      selected: selected.length,
      created: inserts.length,
      updated: updates.length,
      favorites: favourites.size,
    };
  }

  /**
   * Completa el total de capítulos y los datos de emisión desde AniList.
   * - Animes vinculados: una petición por cada 50.
   * - Animes sin vincular y sin total: busca por título (máx. 5 por llamada) y solo vincula
   *   si el título coincide exactamente, para no enlazar el anime equivocado.
   * - Sin `force`, solo revisa lo desactualizado: en emisión cada 6 h, el resto cada 7 días.
   */
  async syncEpisodes(token: string, opts: { ids?: string[]; force?: boolean } = {}) {
    let query = this.table(token).select(
      'id, title, anilist_id, total_episodes, watched_episodes, cover_url, airing_status, episodes_synced_at',
    );
    if (opts.ids?.length) query = query.in('id', opts.ids);
    const { data, error } = await query;
    if (error) this.fail(error);
    const rows = (data ?? []) as Anime[];

    const now = Date.now();
    const stale = (a: Anime) => {
      if (opts.force || !a.episodes_synced_at) return true;
      const age = now - new Date(a.episodes_synced_at).getTime();
      return age > (a.airing_status === 'RELEASING' || a.airing_status === 'NOT_YET_RELEASED' ? 6 : 7 * 24) * 3600_000;
    };
    const candidates = rows.filter(stale);
    const usedIds = new Set(rows.map((a) => a.anilist_id).filter(Boolean));

    // Vincular por título los que no tienen anilist_id ni total
    const newLinks = new Map<string, number>();
    const unlinked = candidates.filter((a) => !a.anilist_id && a.total_episodes === null).slice(0, 5);
    for (const a of unlinked) {
      const results = await this.anilist.search(a.title);
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
        updates.push({ id: a.id, row: { episodes_synced_at: syncedAt } }); // evita reintentar en cada carga
        continue;
      }
      const row: Record<string, unknown> = { ...airingFields(m), episodes_synced_at: syncedAt };
      if (!a.anilist_id) row.anilist_id = anilistId;
      if (!a.cover_url && m.cover_url) row.cover_url = m.cover_url;
      // Solo se acepta el total de AniList si no deja el progreso por encima del total
      if (m.total_episodes !== null && m.total_episodes >= a.watched_episodes && m.total_episodes !== a.total_episodes) {
        row.total_episodes = m.total_episodes;
      }
      updates.push({ id: a.id, row });
    }

    for (let i = 0; i < updates.length; i += 10) {
      const results = await Promise.all(
        updates.slice(i, i + 10).map((u) => this.table(token).update(u.row).eq('id', u.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) this.fail(failed.error);
    }

    return {
      checked: candidates.length,
      updated: updates.filter((u) => Object.keys(u.row).length > 1).length,
      linked: newLinks.size,
    };
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
      anilist_id: merged.anilist_id ?? null,
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

function normTitle(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function airingFields(m: CatalogAnime) {
  return {
    airing_status: m.airing_status,
    aired_episodes: m.aired_episodes,
    next_episode_at: m.next_episode_at,
    episodes_synced_at: new Date().toISOString(),
  };
}
