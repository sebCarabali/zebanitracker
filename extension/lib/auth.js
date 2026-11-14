import { CONFIG } from '../config.js';

const KEY = 'session';

async function authFetch(path, body) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Error ${res.status}`);
  return data;
}

async function save(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
    email: data.user?.email,
  };
  await chrome.storage.local.set({ [KEY]: session });
  return session;
}

export async function signIn(email, password) {
  return save(await authFetch('token?grant_type=password', { email, password }));
}

export async function signOut() {
  const s = await getStoredSession();
  if (s) {
    fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
    }).catch(() => {});
  }
  await chrome.storage.local.remove(KEY);
}

async function getStoredSession() {
  const { [KEY]: s } = await chrome.storage.local.get(KEY);
  return s ?? null;
}

/** Devuelve una sesión válida, refrescando el token si está por expirar. */
export async function getSession() {
  const s = await getStoredSession();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  try {
    return await save(await authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh_token }));
  } catch {
    await chrome.storage.local.remove(KEY);
    return null;
  }
}
