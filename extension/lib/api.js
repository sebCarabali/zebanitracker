import { CONFIG } from '../config.js';
import { getSession } from './auth.js';

export class AuthError extends Error {}

async function request(path, { method = 'GET', body } = {}) {
  const session = await getSession();
  if (!session) throw new AuthError('Sesión expirada');
  const res = await fetch(`${CONFIG.API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new AuthError('Sesión expirada');
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Error ${res.status}`);
  return data;
}

export const api = {
  list: (search = '') => request(`/animes${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  create: (anime) => request('/animes', { method: 'POST', body: anime }),
  setProgress: (id, episode, url) => request(`/animes/${id}/progress`, { method: 'PATCH', body: { episode, ...(url ? { url } : {}) } }),
  syncEpisodes: () => request('/animes/sync-episodes', { method: 'POST', body: {} }),
  next: (id) => request(`/animes/${id}/progress/next`, { method: 'POST' }),
  toggleFavorite: (id) => request(`/animes/${id}/favorite`, { method: 'POST' }),
  searchCatalog: (q) => request(`/catalog/search?q=${encodeURIComponent(q)}`),
};
