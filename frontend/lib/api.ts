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
  title_romaji: string | null;
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
  franchise_id: number | null;
  season_number: number | null;
  completed_at: string | null;
  last_watched_at: string | null;
  media_type: MediaType;
  total_volumes: number | null;
  watched_volumes: number;
  duration: number | null;
  priority: number | null;
  tags: string[];
  rewatching: boolean;
  reminder_snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

export type MediaType = 'anime' | 'manga' | 'novel';
export const MEDIA_LABELS: Record<MediaType, string> = { anime: 'Anime', manga: 'Manga', novel: 'Novela ligera' };
/** "capítulo" en anime y libros; el plural cambia para que el texto suene natural. */
export const UNIT: Record<MediaType, { one: string; many: string; short: string }> = {
  anime: { one: 'capítulo', many: 'capítulos', short: 'cap.' },
  manga: { one: 'capítulo', many: 'capítulos', short: 'cap.' },
  novel: { one: 'capítulo', many: 'capítulos', short: 'cap.' },
};

export interface Rewatch { id: number; anime_id: string; finished_at: string; note: string | null }
export interface StaleAnime extends Anime { idle_days: number }

export interface Comparison {
  username: string;
  following?: boolean;
  compatibility: number | null;
  breakdown: { genres: number; scores: number | null; overlap: number };
  common: { anilist_id: number; title: string; cover_url: string | null; my_score: number | null; their_score: number | null; my_status: string; their_status: string; both_favorite: boolean }[];
  shared_genres: string[];
  my_top_genres: string[];
  their_top_genres: string[];
  recommended_from_them: { anilist_id: number; title: string; cover_url: string | null; score: number | null; is_favorite: boolean }[];
  disagreements: Comparison['common'];
}
export interface SocialOverview {
  following: { username: string; since: string; available: boolean; compatibility: number | null; common: number; total: number }[];
  followers: { username: string; since: string; is_public: boolean; follows_back: boolean }[];
}
export interface Party {
  id: string;
  owner_id: string;
  anilist_id: number | null;
  title: string;
  cover_url: string | null;
  total_episodes: number | null;
  invite_code: string;
  created_at: string;
  is_owner: boolean;
  members: { user_id: string; name: string; watched_episodes: number; is_me: boolean; updated_at: string }[];
  shared_progress: number;
  my_progress: number;
  waiting_for: string[];
  in_my_list: boolean;
  list_synced: boolean;
}
export interface NaturalSearchResult {
  query: string;
  interpretation: string | null;
  filters: Record<string, unknown> & { similar_to?: string[] };
  items: { media: CatalogAnime; reason: string; in_list: string | null }[];
  cached?: boolean;
}
export interface Recap { anime_id: string; title: string; episode: number; lang: string; recap: string; key_points: string[]; confidence: 'high' | 'medium' | 'low'; cached: boolean }
export interface MonthlyStats {
  month: string; episodes: number; minutes: number; titles: number; active_days: number;
  best_day: { date: string; episodes: number } | null; longest_streak: number;
  top_genres: { name: string; episodes: number }[]; top_studios: { name: string; episodes: number }[];
  top_titles: { id: string; title: string; cover_url: string | null; episodes: number }[];
  completed: { title: string; score: number | null }[]; started: number; by_weekday: number[]; night_owl: number; previous_episodes: number;
}
export interface Monthly { stats: MonthlyStats; ai: { headline: string; summary: string; fun_facts: string[] } | null; cached?: boolean }

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
  media_type?: MediaType;
  total_volumes?: number | null;
  duration?: number | null;
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
  episode_titles?: string[];
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
  media?: MediaType;
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
  MANGA: 'Manga', NOVEL: 'Novela', ONE_SHOT: 'One-shot',
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

export interface FranchiseEntry { media: CatalogAnime; start: string | null; season_number: number | null; label: string }
export interface Franchise { root: number; entries: FranchiseEntry[] }

export interface AiDescription { lang: string; text: string | null; original: string | null; translated: boolean }
export interface AiRecommendations {
  summary: string;
  request: string | null;
  items: { media: CatalogAnime; reason: string }[];
  generated_at: string | null;
  lang: string;
  stale?: boolean;
  empty?: boolean;
  note?: string;
}

export const LANGUAGES: Record<string, string> = {
  es: 'Español', en: 'English', pt: 'Português', fr: 'Français', it: 'Italiano', de: 'Deutsch', ja: '日本語', ko: '한국어',
};

export interface WatchEvent { anime_id: string; episode: number; watched_at: string }
export interface Discover {
  recommendations: { media: CatalogAnime; because: string[]; rating: number }[];
  sequels: { media: CatalogAnime; after: string }[];
}
export interface Profile {
  language: string;
  ai_preferences: string | null;
  username: string | null;
  is_public: boolean;
  notify_email: boolean;
  anilist_username: string | null;
  anilist_connected: boolean;
  email_notifications_available: boolean;
  stale_weeks: number;
}
export interface PublicList {
  username: string;
  animes: (Pick<Anime, 'title' | 'cover_url' | 'status' | 'watched_episodes' | 'total_episodes' | 'is_favorite' | 'score' | 'anilist_id' | 'genres' | 'format' | 'season_year'> & { media_type?: MediaType; studios?: string[]; duration?: number | null })[];
}

export type AnimeInput = Partial<Pick<Anime, 'title' | 'total_episodes' | 'watched_episodes' | 'status' | 'is_favorite' | 'cover_url' | 'source_url' | 'notes' | 'score' | 'review' | 'last_episode_url' | 'anilist_id' | 'media_type' | 'total_volumes' | 'watched_volumes' | 'tags' | 'priority'>> & {
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
  list: (params: { favorite?: boolean; status?: AnimeStatus | ''; search?: string; media?: MediaType; tag?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.media) q.set('media', params.media);
    if (params.tag) q.set('tag', params.tag);
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
  updateProfile: (p: Partial<Pick<Profile, 'username' | 'is_public' | 'notify_email' | 'language' | 'ai_preferences' | 'stale_weeks'>>) =>
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
  catalogSeasons: (anilistId: number) => request<Franchise>(`/catalog/anime/${anilistId}/seasons`),
  addMany: (items: { anilist_id: number; status: AnimeStatus }[]) =>
    request<Anime[]>('/animes/batch', { method: 'POST', body: JSON.stringify({ items }) }),
  aiDescription: (anilistId: number, lang?: string) =>
    request<AiDescription>(`/ai/description/${anilistId}${lang ? `?lang=${lang}` : ''}`),
  aiRecommendations: () => request<AiRecommendations | null>('/ai/recommendations'),
  generateAiRecommendations: (body: { request?: string; refresh?: boolean } = {}) =>
    request<AiRecommendations>('/ai/recommendations', { method: 'POST', body: JSON.stringify(body) }),
  catalogFilters: () => request<FilterOptions>('/catalog/filters'),
  markRange: (id: string, from: number, to: number, watched_at?: string) =>
    request<{ anime: Anime; logged: number }>(`/animes/${id}/progress/range`, { method: 'POST', body: JSON.stringify({ from, to, ...(watched_at ? { watched_at } : {}) }) }),
  reorder: (ids: string[]) => request<{ ok: boolean }>('/animes/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
  tags: () => request<{ tag: string; count: number }[]>('/animes/tags'),
  stale: () => request<{ weeks: number; items: StaleAnime[] }>('/animes/stale'),
  staleAction: (id: string, action: 'resume' | 'drop' | 'snooze') =>
    request<Anime>(`/animes/${id}/stale`, { method: 'POST', body: JSON.stringify({ action }) }),
  rewatches: (id?: string) => request<Rewatch[]>(id ? `/animes/${id}/rewatches` : '/animes/rewatches'),
  addRewatch: (id: string, body: { finished_at?: string; note?: string }) =>
    request<Rewatch>(`/animes/${id}/rewatches`, { method: 'POST', body: JSON.stringify(body) }),
  removeRewatch: (rewatchId: number) => request<void>(`/animes/rewatches/${rewatchId}`, { method: 'DELETE' }),
  startRewatch: (id: string) => request<Anime>(`/animes/${id}/rewatch/start`, { method: 'POST' }),
  cancelRewatch: (id: string) => request<Anime>(`/animes/${id}/rewatch/cancel`, { method: 'POST' }),
  social: () => request<SocialOverview>('/social'),
  follow: (username: string) => request<{ username: string }>('/social/follow', { method: 'POST', body: JSON.stringify({ username }) }),
  unfollow: (username: string) => request<void>(`/social/follow/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  compare: (username: string) => request<Comparison>(`/social/compare/${encodeURIComponent(username)}`),
  parties: () => request<Party[]>('/parties'),
  party: (id: string) => request<Party>(`/parties/${id}`),
  createParty: (body: { anilist_id?: number; title?: string; total_episodes?: number; cover_url?: string }) =>
    request<Party>('/parties', { method: 'POST', body: JSON.stringify(body) }),
  joinParty: (code: string) => request<Party>('/parties/join', { method: 'POST', body: JSON.stringify({ code }) }),
  partyProgress: (id: string, episode: number) =>
    request<Party>(`/parties/${id}/progress`, { method: 'PATCH', body: JSON.stringify({ episode }) }),
  leaveParty: (id: string) => request<void>(`/parties/${id}`, { method: 'DELETE' }),
  naturalSearch: (query: string, media?: MediaType) =>
    request<NaturalSearchResult>('/ai/search', { method: 'POST', body: JSON.stringify({ query, ...(media ? { media } : {}) }) }),
  recap: (animeId: string, episode?: number) => request<Recap>(`/ai/recap/${animeId}${episode ? `?episode=${episode}` : ''}`),
  monthly: (month: string, ai = true) =>
    request<Monthly>(`/ai/monthly?month=${month}&tz=${-new Date().getTimezoneOffset()}${ai ? '' : '&ai=0'}`),
  searchCatalogMedia: (q: string, media: MediaType) => request<CatalogAnime[]>(`/catalog/search?q=${encodeURIComponent(q)}&media=${media}`),
  importAniList: (body: { username: string; statuses?: AniListStatus[]; include_favorites?: boolean }) =>
    request<ImportResult>('/animes/import/anilist', { method: 'POST', body: JSON.stringify(body) }),
};

export const STATUS_COLORS: Record<AnimeStatus, string> = {
  // Variables CSS: cambian con el tema (claro / oscuro)
  watching: 'var(--watching)',
  completed: 'var(--completed)',
  plan_to_watch: 'var(--plan)',
  on_hold: 'var(--hold)',
  dropped: 'var(--dropped)',
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

/** Minutos que faltan de un título (capítulos restantes × duración; manga/novela no cuentan). */
export function remainingMinutes(a: Pick<Anime, 'media_type' | 'total_episodes' | 'aired_episodes' | 'watched_episodes' | 'duration' | 'format'>): number | null {
  if (a.media_type && a.media_type !== 'anime') return null;
  const total = a.total_episodes ?? a.aired_episodes;
  if (total == null) return null;
  return Math.max(0, total - a.watched_episodes) * (a.duration ?? (a.format === 'MOVIE' ? 100 : MINUTES_PER_EPISODE));
}

/** "3 h 20 min", "2 días 4 h" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d} días ${rh} h` : `${d} días`;
}
