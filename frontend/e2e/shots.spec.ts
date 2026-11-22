import { anime, test } from './fixtures';

// Capturas para revisar el diseño: SHOTS=1 npx playwright test shots
test.skip(!process.env.SHOTS, 'solo bajo demanda');

const pages = ['/', '/animes/a1', '/explore', '/plan', '/stats', '/friends', '/together'];
for (const [name, size] of [['desk', { width: 1440, height: 1000 }], ['mob', { width: 390, height: 844 }]] as const) {
  for (const p of pages) {
    test(`shot ${name} ${p}`, async ({ page, api }) => {
      api.on('GET', /^\/animes\/stale$/, () => ({ weeks: 3, items: [{ ...anime({ id: 'a2', title: 'Dandadan', watched_episodes: 7 }), idle_days: 40 }] }));
      api.on('GET', /^\/social$/, () => ({ following: [{ username: 'ana', since: '2026-11-01', available: true, compatibility: 82, common: 5, total: 40 }], followers: [] }));
      api.on('GET', /^\/catalog\/browse/, () => ({ results: Array.from({ length: 8 }, (_, i) => ({ anilist_id: 100 + i, title: ['Frieren', 'Dandadan', 'Kaiju No. 8', 'Spy x Family', 'Monster', 'Mushishi', 'Vinland Saga', 'Bocchi'][i], total_episodes: 12, cover_url: null, format: 'TV', year: 2024, genres: ['Action', 'Fantasy'], score: 80 + i, site_url: '', airing_status: 'FINISHED', season: 'FALL' })), page: 1, hasNextPage: false, total: 8 }));
      api.on('GET', /^\/parties$/, () => [{ id: '1', owner_id: 'u1', anilist_id: 1, title: 'Frieren', cover_url: null, total_episodes: 28, invite_code: 'abc123def0', created_at: '', is_owner: true, in_my_list: true, list_synced: false,
        members: [{ user_id: 'u1', name: 'sebastian', watched_episodes: 6, is_me: true, updated_at: '' }, { user_id: 'u2', name: 'ana', watched_episodes: 5, is_me: false, updated_at: '' }], shared_progress: 5, my_progress: 6, waiting_for: ['ana'] }]);
      await page.setViewportSize(size);
      await page.goto(p);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `/tmp/shots/${name}${p.replace(/\//g, '_') || '_home'}.png`, fullPage: name === 'mob' ? false : false });
    });
  }
}
