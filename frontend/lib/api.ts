import { supabase } from './supabase';

export type AnimeStatus = 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped';

export const STATUS_LABELS: Record<AnimeStatus, string> = {
  watching: 'Viendo',
  completed: 'Completado',
  plan_to_watch: 'Pendiente',
  on_hold: 'En pausa',
  dropped: 'Abandonado',
};

export interface Anime {
  id: string;
  title: string;
  total_episodes: number | null;
  watched_episodes: number;
  status: AnimeStatus;
  is_favorite: boolean;
  cover_url: string | null;
  source_url: string | null;
  notes: string | null;
  anilist_id: number | null;
  last_watched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogAnime {
  anilist_id: number;
  title: string;
  title_romaji: string | null;
  title_english: string | null;
  total_episodes: number | null;
  cover_url: string | null;
  site_url: string;
  format: string | null;
  year: number | null;
  airing_status: string | null;
  season: string | null;
  genres: string[];
  score: number | null;
}

export interface BrowseFilters {
  search?: string;
  genres?: string[];
  tags?: string[];
  year?: number;
  season?: string;
  formats?: string[];
  status?: string;
  sort?: string;
  page?: number;
}

export interface BrowseResult {
  results: CatalogAnime[];
  page: number;
  hasNextPage: boolean;
  total: number;
}

export interface FilterOptions {
  genres: string[];
  tags: { name: string; category: string }[];
}

export const SEASON_LABELS: Record<string, string> = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otoño' };
export const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV', TV_SHORT: 'TV corto', MOVIE: 'Película', SPECIAL: 'Especial', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Música',
};
export const AIRING_LABELS: Record<string, string> = {
  RELEASING: 'En emisión', FINISHED: 'Finalizado', NOT_YET_RELEASED: 'Próximamente', CANCELLED: 'Cancelado', HIATUS: 'En pausa',
};
export const SORT_LABELS: Record<string, string> = {
  POPULARITY_DESC: 'Popularidad', TRENDING_DESC: 'Tendencia', SCORE_DESC: 'Puntuación',
  START_DATE_DESC: 'Más recientes', TITLE_ROMAJI: 'Título (A-Z)', SEARCH_MATCH: 'Relevancia',
};

export type AniListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export const ANILIST_STATUS_LABELS: Record<AniListStatus, string> = {
  CURRENT: 'Viendo',
  REPEATING: 'Reviendo',
  COMPLETED: 'Completados',
  PLANNING: 'Planeados',
  PAUSED: 'En pausa',
  DROPPED: 'Abandonados',
};

export interface ImportResult {
  username: string;
  found: number;
  selected: number;
  created: number;
  updated: number;
  favorites: number;
}

export type AnimeInput = Partial<Omit<Anime, 'id' | 'created_at' | 'updated_at' | 'last_watched_at'>> & {
  title?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No has iniciado sesión');

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg ?? `Error ${res.status}`);
  }
  return body as T;
}

export const api = {
  list: (params: { favorite?: boolean; status?: AnimeStatus | ''; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.favorite) q.set('favorite', 'true');
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return request<Anime[]>(`/animes${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => request<Anime>(`/animes/${id}`),
  create: (input: AnimeInput) => request<Anime>('/animes', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: AnimeInput) =>
    request<Anime>(`/animes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/animes/${id}`, { method: 'DELETE' }),
  toggleFavorite: (id: string) => request<Anime>(`/animes/${id}/favorite`, { method: 'POST' }),
  setProgress: (id: string, episode: number) =>
    request<Anime>(`/animes/${id}/progress`, { method: 'PATCH', body: JSON.stringify({ episode }) }),
  next: (id: string) => request<Anime>(`/animes/${id}/progress/next`, { method: 'POST' }),
  prev: (id: string) => request<Anime>(`/animes/${id}/progress/prev`, { method: 'POST' }),
  searchCatalog: (q: string) => request<CatalogAnime[]>(`/catalog/search?q=${encodeURIComponent(q)}`),
  browseCatalog: (f: BrowseFilters) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      q.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    return request<BrowseResult>(`/catalog/browse?${q}`);
  },
  catalogFilters: () => request<FilterOptions>('/catalog/filters'),
  importAniList: (body: { username: string; statuses?: AniListStatus[]; include_favorites?: boolean }) =>
    request<ImportResult>('/animes/import/anilist', { method: 'POST', body: JSON.stringify(body) }),
};
