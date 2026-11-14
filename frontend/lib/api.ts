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
  last_watched_at: string | null;
  created_at: string;
  updated_at: string;
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
};
