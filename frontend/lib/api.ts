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
  mal_id: number | null;
  score: number | null;
  review: string | null;
  genres: string[];
  studios: string[];
  format: string | null;
  season_year: number | null;
  airing_status: string | null;
  aired_episodes: number | null;
  next_episode_at: string | null;
  last_episode_url: string | null;
  completed_at: string | null;
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
  aired_episodes: number | null;
  next_episode_at: string | null;
  next_episode: number | null;
}

export interface AnimeDetails extends CatalogAnime {
  description: string | null;
  banner_url: string | null;
  cover_large_url: string | null;
  duration: number | null;
  studios: string[];
  source: string | null;
  start_date: string | null;
  end_date: string | null;
  popularity: number | null;
  tags: string[];
  trailer_url: string | null;
  relations: { anilist_id: number; title: string; relation: string; format: string | null; cover_url: string | null }[];
}

export const RELATION_LABELS: Record<string, string> = {
  PREQUEL: 'Precuela', SEQUEL: 'Secuela', PARENT: 'Historia principal', SIDE_STORY: 'Historia paralela',
  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Versión alternativa', SUMMARY: 'Resumen', CHARACTER: 'Personajes',
  ADAPTATION: 'Adaptación', SOURCE: 'Obra original', COMPILATION: 'Compilación', CONTAINS: 'Contiene', OTHER: 'Relacionado',
};

export const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: 'Original', MANGA: 'Manga', LIGHT_NOVEL: 'Novela ligera', VISUAL_NOVEL: 'Novela visual', VIDEO_GAME: 'Videojuego',
  WEB_NOVEL: 'Novela web', NOVEL: 'Novela', WEB_MANGA: 'Manga web', DOUJINSHI: 'Doujinshi', ANIME: 'Anime', GAME: 'Juego',
  COMIC: 'Cómic', MULTIMEDIA_PROJECT: 'Proyecto multimedia', PICTURE_BOOK: 'Libro ilustrado', LIVE_ACTION: 'Live action', OTHER: 'Otro',
};

export function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
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
  username?: string;
  found: number;
  selected: number;
  created: number;
  updated: number;
  favorites: number;
  not_found?: string[];
}

export interface WatchEvent { anime_id: string; episode: number; watched_at: string }
export interface Discover {
  recommendations: { media: CatalogAnime; because: string[]; rating: number }[];
  sequels: { media: CatalogAnime; after: string }[];
}
export interface Profile {
  username: string | null;
  is_public: boolean;
  notify_email: boolean;
  anilist_username: string | null;
  anilist_connected: boolean;
  email_notifications_available: boolean;
}
export interface PublicList {
  username: string;
  animes: Pick<Anime, 'title' | 'cover_url' | 'status' | 'watched_episodes' | 'total_episodes' | 'is_favorite' | 'score' | 'anilist_id' | 'genres' | 'format' | 'season_year'>[];
}

export type AnimeInput = Partial<Pick<Anime, 'title' | 'total_episodes' | 'watched_episodes' | 'status' | 'is_favorite' | 'cover_url' | 'source_url' | 'notes' | 'score' | 'review' | 'last_episode_url' | 'anilist_id'>> & {
  title?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  let authHeader: Record<string, string> = {};
  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('No has iniciado sesión');
    authHeader = { Authorization: `Bearer ${token}` };
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeader, ...init.headers },
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
  setProgress: (id: string, episode: number, url?: string) =>
    request<Anime>(`/animes/${id}/progress`, { method: 'PATCH', body: JSON.stringify({ episode, ...(url ? { url } : {}) }) }),
  activity: (days = 365) => request<WatchEvent[]>(`/animes/activity?days=${days}`),
  discover: () => request<Discover>('/animes/discover'),
  importMal: (xml: string) => request<ImportResult>('/animes/import/mal', { method: 'POST', body: JSON.stringify({ xml }) }),
  exportMal: async () => {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`${API_URL}/animes/export/mal`, { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return { blob: await res.blob(), exported: Number(res.headers.get('X-Exported') ?? 0), skipped: Number(res.headers.get('X-Skipped') ?? 0) };
  },
  profile: () => request<Profile>('/profile'),
  updateProfile: (p: Partial<Pick<Profile, 'username' | 'is_public' | 'notify_email'>>) =>
    request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(p) }),
  connectAniList: (token: string) => request<Profile>('/profile/anilist', { method: 'PUT', body: JSON.stringify({ token }) }),
  disconnectAniList: () => request<Profile>('/profile/anilist', { method: 'DELETE' }),
  publicList: (username: string) => request<PublicList>(`/public/${encodeURIComponent(username)}`, {}, false),
  next: (id: string) => request<Anime>(`/animes/${id}/progress/next`, { method: 'POST' }),
  prev: (id: string) => request<Anime>(`/animes/${id}/progress/prev`, { method: 'POST' }),
  syncEpisodes: (force = false) =>
    request<{ checked: number; updated: number; linked: number }>('/animes/sync-episodes', {
      method: 'POST', body: JSON.stringify({ force }),
    }),
  syncOne: (id: string) => request<Anime>(`/animes/${id}/sync`, { method: 'POST' }),
  searchCatalog: (q: string) => request<CatalogAnime[]>(`/catalog/search?q=${encodeURIComponent(q)}`),
  browseCatalog: (f: BrowseFilters) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      q.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    return request<BrowseResult>(`/catalog/browse?${q}`);
  },
  catalogDetails: (anilistId: number) => request<AnimeDetails>(`/catalog/anime/${anilistId}`),
  catalogFilters: () => request<FilterOptions>('/catalog/filters'),
  importAniList: (body: { username: string; statuses?: AniListStatus[]; include_favorites?: boolean }) =>
    request<ImportResult>('/animes/import/anilist', { method: 'POST', body: JSON.stringify(body) }),
};

export const STATUS_COLORS: Record<AnimeStatus, string> = {
  watching: '#F07B3F',
  completed: '#2D4059',
  plan_to_watch: '#9AA4B4',
  on_hold: '#D9A21B',
  dropped: '#EA5455',
};

/** "en 3 días", "mañana", "en 5 h" */
export function relativeTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const h = diff / 3600_000;
  if (Math.abs(h) < 24) return rtf.format(Math.round(h), 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

/** Capítulos disponibles para marcar: total conocido, si no los emitidos. */
export function knownEpisodes(a: Pick<Anime, 'total_episodes' | 'aired_episodes'>): number | null {
  return a.total_episodes ?? a.aired_episodes ?? null;
}

/** Temporada de anime actual según la fecha. */
export function currentSeason(d = new Date()): { season: string; year: number } {
  const m = d.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, year: d.getFullYear() };
}

/** Intenta adivinar la URL del siguiente capítulo incrementando el último número de la ruta. */
export function guessNextEpisodeUrl(url: string | null, watched: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const re = new RegExp(`(\\D|^)(0*${watched})(?!.*\\d)`);
    const path = u.pathname + u.search;
    if (!re.test(path)) return null;
    const next = path.replace(re, (_m, pre: string, num: string) => pre + String(watched + 1).padStart(num.length, '0'));
    return u.origin + next;
  } catch {
    return null;
  }
}

export const MINUTES_PER_EPISODE = 24;
