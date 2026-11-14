import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { AnimeStatus, CreateAnimeDto, ListAnimesQuery, UpdateAnimeDto } from './dto/anime.dto';

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
  last_watched_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class AnimesService {
  constructor(private readonly supabase: SupabaseService) {}

  private table(token: string) {
    return this.supabase.forUser(token).from('animes');
  }

  private fail(error: PostgrestError): never {
    // 23514 = check_violation (p.ej. vistos > total)
    if (error.code === '23514') throw new BadRequestException('Los capítulos vistos no pueden superar el total');
    if (error.code === 'PGRST116') throw new NotFoundException('Anime no encontrado');
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
    return data as Anime;
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
      ...(progressChanged && watched > 0 ? { last_watched_at: new Date().toISOString() } : {}),
    };
  }
}
