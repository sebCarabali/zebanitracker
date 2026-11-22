import { test as base, expect, type Page, type Route } from '@playwright/test';

const API = 'http://api.e2e.test/api';

export function anime(over: Record<string, unknown> = {}) {
  return {
    id: 'a1', title: 'Frieren: Beyond Journey’s End', title_romaji: 'Sousou no Frieren', total_episodes: 28, aired_episodes: 28, watched_episodes: 12,
    status: 'watching', is_favorite: true, cover_url: null, source_url: null, notes: null, score: null, review: null,
    anilist_id: 154587, mal_id: 52991, genres: ['Adventure', 'Fantasy'], studios: ['MADHOUSE'], format: 'TV', season_year: 2023,
    airing_status: 'FINISHED', next_episode_at: null, last_episode_url: null, completed_at: null, franchise_id: null, season_number: null,
    last_watched_at: '2026-11-13T10:00:00Z', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-13T10:00:00Z',
    ...over,
  };
}

export const DATA = [
  anime(),
  anime({
    id: 'a2', title: 'Dandadan', total_episodes: null, aired_episodes: 8, watched_episodes: 7, is_favorite: false, anilist_id: 2,
    airing_status: 'RELEASING', next_episode_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    last_episode_url: 'https://example.com/ver/dandadan-7',
  }),
  anime({ id: 'a3', title: 'Solo Leveling', total_episodes: 12, aired_episodes: 12, watched_episodes: 12, status: 'completed', score: 9, anilist_id: 3, franchise_id: 3, season_number: 1 }),
  anime({ id: 'a5', title: 'Solo Leveling Season 2', title_romaji: 'Ore dake Level Up na Ken Season 2', total_episodes: 13, aired_episodes: 13,
    watched_episodes: 4, status: 'watching', is_favorite: false, anilist_id: 30, franchise_id: 3, season_number: 2,
    last_watched_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z' }),
  anime({ id: 'a4', title: 'Spy x Family', total_episodes: 25, watched_episodes: 0, status: 'plan_to_watch', is_favorite: false, anilist_id: 4 }),
];

type Handler = (route: Route, url: URL, body: unknown) => unknown;

/** Sesión de Supabase simulada (cookie de @supabase/ssr) y API simulada con registro de llamadas. */
export const test = base.extend<{ api: { calls: { method: string; path: string; body: unknown }[]; on: (m: string, p: RegExp, h: Handler) => void } }>({
  api: [async ({ page, context }, use) => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: 'e2e', refresh_token: 'e2e', expires_in: 3600, expires_at: now + 36_000, token_type: 'bearer',
      user: { id: 'u1', email: 'sebastian@correo.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' },
    };
    const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
    await context.addCookies([{ name: 'sb-e2e-auth-token', value, url: 'http://localhost:3100' }]);
    await page.route('https://e2e.supabase.co/**', (r) => r.fulfill({ status: 200, body: '{}' }));

    const calls: { method: string; path: string; body: unknown }[] = [];
    const handlers: { m: string; p: RegExp; h: Handler }[] = [];
    let list = structuredClone(DATA);

    const json = (route: Route, body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });

    await page.route(`${API}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace('/api', '');
      const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      calls.push({ method: req.method(), path: path + url.search, body });
      for (const h of handlers) if (h.m === req.method() && h.p.test(path)) return json(route, await h.h(route, url, body));

      if (path === '/animes' && req.method() === 'GET') return json(route, list);
      if (path === '/animes/sync-episodes') return json(route, { checked: 0, updated: 0, linked: 0 });
      if (path === '/animes/activity') return json(route, [{ anime_id: 'a1', episode: 12, watched_at: new Date().toISOString() }]);
      if (path === '/animes/discover') return json(route, { recommendations: [], sequels: [] });
      const next = path.match(/^\/animes\/(\w+)\/progress\/next$/);
      if (next) {
        list = list.map((a) => (a.id === next[1] ? { ...a, watched_episodes: (a.watched_episodes as number) + 1 } : a));
        return json(route, list.find((a) => a.id === next[1]));
      }
      const one = path.match(/^\/animes\/(\w+)$/);
      if (one && req.method() === 'GET') return json(route, list.find((a) => a.id === one[1]));
      if (path === '/ai/recommendations' && req.method() === 'GET') return json(route, null);
      if (path === '/ai/recommendations') return json(route, { summary: 'Te gusta la fantasía tranquila.', request: null, items: [], generated_at: new Date().toISOString(), lang: 'es' });
      if (path.startsWith('/ai/description/')) return json(route, { lang: 'es', text: 'Sinopsis en español.', original: 'Synopsis.', translated: true });
      if (path.startsWith('/catalog/filters')) return json(route, { genres: ['Action', 'Fantasy'], tags: [{ name: 'Magic', category: 'Theme' }] });
      if (path.startsWith('/catalog/browse')) return json(route, { results: [], page: 1, hasNextPage: false, total: 0 });
      return json(route, {});
    });

    await use({ calls, on: (m, p, h) => handlers.unshift({ m, p, h }) });
  }, { auto: true }], // se aplica en todos los tests, aunque no pidan `api`
});

export { expect, type Page };
