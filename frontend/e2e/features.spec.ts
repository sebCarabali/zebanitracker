import { anime, expect, test } from './fixtures';

test('Planeo ver: tiempo total, reordenar y "¿Qué veo hoy?"', async ({ page, api }) => {
  const plan = [
    anime({ id: 'p1', title: 'Spy x Family', total_episodes: 25, watched_episodes: 0, status: 'plan_to_watch', duration: 24, genres: ['Comedy'], priority: 0 }),
    anime({ id: 'p2', title: 'Monster', total_episodes: 74, watched_episodes: 0, status: 'plan_to_watch', duration: 24, genres: ['Mystery', 'Thriller'], priority: 1 }),
    anime({ id: 'p3', title: 'Your Name', total_episodes: 1, watched_episodes: 0, status: 'plan_to_watch', duration: 106, format: 'MOVIE', genres: ['Romance', 'Drama'], priority: 2 }),
  ];
  api.on('GET', /^\/animes$/, () => plan);
  api.on('POST', /^\/animes\/reorder$/, () => ({ ok: true }));
  await page.goto('/plan');
  // 25×24 + 74×24 + 106 = 2482 min
  await expect(page.locator('.stat').filter({ hasText: 'De anime' })).toContainText('41 h 22 min');
  await page.getByRole('button', { name: 'Bajar Spy x Family' }).click();
  await expect(page.locator('.plan-item').first()).toContainText('Monster');
  await expect.poll(() => api.calls.find((c) => c.path === '/animes/reorder')?.body).toEqual({ ids: ['p2', 'p1', 'p3'] });

  await page.getByRole('radio', { name: '🧠 Para pensar' }).click();
  await page.getByRole('button', { name: 'Elegir por mí' }).click();
  await expect(page.locator('.pick-card')).toContainText('Monster');
});

test('"¿Lo retomas o lo dejas?" en Mi lista', async ({ page, api }) => {
  api.on('GET', /^\/animes\/stale$/, () => ({ weeks: 3, items: [{ ...anime({ id: 'a2', title: 'Dandadan', watched_episodes: 7 }), idle_days: 40 }] }));
  api.on('POST', /^\/animes\/a2\/stale$/, (_r, _u, body) => anime({ id: 'a2', title: 'Dandadan', status: (body as { action: string }).action === 'drop' ? 'dropped' : 'watching' }));
  await page.goto('/');
  const box = page.locator('.stale');
  await expect(box).toContainText('Dandadan');
  await expect(box).toContainText('hace 40 días');
  await box.getByRole('button', { name: 'Lo dejo' }).click();
  await expect(box).toHaveCount(0);
  expect(api.calls.find((c) => c.path === '/animes/a2/stale')?.body).toEqual({ action: 'drop' });
});

test('marcar varios capítulos de golpe ("vi del 13 al 16")', async ({ page, api }) => {
  api.on('POST', /^\/animes\/a1\/progress\/range$/, () => ({ anime: anime({ watched_episodes: 16 }), logged: 4 }));
  await page.goto('/animes/a1');
  const form = page.locator('.range-mark');
  await expect(form.getByLabel('Desde el capítulo')).toHaveValue('13');
  await form.getByLabel('Hasta el capítulo').fill('16');
  await form.getByLabel('Cuándo').selectOption('yesterday');
  await form.getByRole('button', { name: 'Marcar 4 caps.' }).click();
  await expect(form).toContainText('4 capítulos registrados');
  const call = api.calls.find((c) => c.path === '/animes/a1/progress/range')!;
  expect(call.body).toMatchObject({ from: 13, to: 16 });
  expect((call.body as { watched_at: string }).watched_at).toBeTruthy();
  await expect(page.locator('.ring-label')).toContainText('16 de 28');
});

test('"¿En qué iba?" genera un resumen sin spoilers hasta el último capítulo', async ({ page, api }) => {
  api.on('GET', /^\/ai\/recap\/a1$/, () => ({ anime_id: 'a1', title: 'Frieren', episode: 12, lang: 'es', cached: false,
    recap: 'Frieren y Fern viajan al norte.', key_points: ['Stark se unió al grupo'], confidence: 'high' }));
  await page.goto('/animes/a1');
  await page.getByRole('button', { name: 'Resumir hasta el cap. 12' }).click();
  await expect(page.locator('.recap')).toContainText('Frieren y Fern viajan al norte.');
  await expect(page.locator('.recap')).toContainText('Stark se unió al grupo');
  expect(api.calls.some((c) => c.path === '/ai/recap/a1?episode=12')).toBe(true);
});

test('rewatch: empezar de nuevo y ver el contador', async ({ page, api }) => {
  api.on('GET', /^\/animes\/a3$/, () => anime({ id: 'a3', title: 'Solo Leveling', total_episodes: 12, watched_episodes: 12, status: 'completed' }));
  api.on('GET', /^\/animes\/a3\/rewatches$/, () => [{ id: 1, anime_id: 'a3', finished_at: '2025-05-01T12:00:00Z', note: null }]);
  api.on('POST', /^\/animes\/a3\/rewatch\/start$/, () => anime({ id: 'a3', title: 'Solo Leveling', total_episodes: 12, watched_episodes: 0, status: 'watching', rewatching: true }));
  await page.goto('/animes/a3');
  await expect(page.locator('.rewatch-count')).toHaveText('↻ 1');
  await page.getByRole('button', { name: '↻ Empezar a verlo otra vez' }).click();
  await expect(page.getByText('Estás viéndolo otra vez (rewatch n.º 2)')).toBeVisible();
});

test('listas personalizadas: agregar etiqueta y filtrar Mi lista', async ({ page, api }) => {
  api.on('PATCH', /^\/animes\/a1$/, (_r, _u, body) => anime({ tags: (body as { tags: string[] }).tags }));
  await page.goto('/animes/a1');
  await page.getByRole('button', { name: '+ Clásicos' }).click();
  await expect.poll(() => api.calls.find((c) => c.method === 'PATCH' && c.path === '/animes/a1')?.body).toEqual({ tags: ['Clásicos'] });

  api.on('GET', /^\/animes$/, () => [anime({ tags: ['Clásicos'] }), anime({ id: 'a2', title: 'Dandadan' })]);
  await page.goto('/');
  await page.getByRole('button', { name: '#Clásicos 1' }).click();
  await expect(page.locator('.grid .card')).toHaveCount(1);
});

test('búsqueda en lenguaje natural en Explorar', async ({ page, api }) => {
  api.on('POST', /^\/ai\/search$/, () => ({
    query: 'algo como Frieren pero más corto', interpretation: 'Fantasía tranquila de menos de 13 capítulos',
    filters: { similar_to: ['Frieren'] },
    items: [{ media: { anilist_id: 9, title: 'Mushishi Zoku Shou', total_episodes: 10, cover_url: null, format: 'TV', year: 2014, genres: ['Slice of Life'], score: 88, site_url: '' },
      reason: 'Misma calma contemplativa en pocos capítulos.', in_list: null }],
  }));
  await page.goto('/explore');
  await page.getByRole('radio', { name: '✦ Buscar con IA' }).click();
  await page.getByLabel('Describe lo que quieres ver').fill('algo como Frieren pero más corto');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Fantasía tranquila de menos de 13 capítulos')).toBeVisible();
  await expect(page.getByText('Misma calma contemplativa en pocos capítulos.')).toBeVisible();
  expect(api.calls.find((c) => c.path === '/ai/search')?.body).toEqual({ query: 'algo como Frieren pero más corto', media: 'anime' });
});

test('explorar manga cambia el tipo y los formatos', async ({ page, api }) => {
  await page.goto('/explore');
  await page.getByRole('radio', { name: 'Manga' }).click();
  await expect(page.getByRole('heading', { name: 'Encuentra tu próximo manga' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'One-shot' })).toBeVisible();
  await expect.poll(() => api.calls.some((c) => c.path.startsWith('/catalog/browse') && c.path.includes('media=manga'))).toBe(true);
});

test('amigos: compatibilidad y comparación de listas', async ({ page, api }) => {
  api.on('GET', /^\/social$/, () => ({ following: [{ username: 'ana', since: '2026-11-01', available: true, compatibility: 82, common: 5, total: 40 }], followers: [] }));
  api.on('GET', /^\/social\/compare\/ana$/, () => ({
    username: 'ana', following: true, compatibility: 82, breakdown: { genres: 90, scores: 75, overlap: 12 },
    common: [{ anilist_id: 154587, title: 'Frieren', cover_url: null, my_score: 10, their_score: 9, my_status: 'completed', their_status: 'completed', both_favorite: true }],
    shared_genres: ['Fantasy'], my_top_genres: ['Fantasy', 'Action'], their_top_genres: ['Fantasy', 'Romance'],
    recommended_from_them: [{ anilist_id: 77, title: 'Toradora!', cover_url: null, score: 9, is_favorite: true }], disagreements: [],
  }));
  await page.goto('/friends');
  await expect(page.locator('.friend-card')).toContainText('82%');
  await page.getByRole('link', { name: 'Comparar' }).click();
  await expect(page.getByRole('heading', { name: '¡Almas gemelas del anime!' })).toBeVisible();
  await expect(page.getByText('Le encantan y tú no los tienes')).toBeVisible();
  await expect(page.locator('.common-row')).toContainText('Frieren');
});

test('ver juntos: el avance compartido es el mínimo y se marca el propio', async ({ page, api }) => {
  const party = (mine: number) => ({
    id: '00000000-0000-0000-0000-000000000001', owner_id: 'u1', anilist_id: 154587, title: 'Frieren', cover_url: null, total_episodes: 28,
    invite_code: 'abc123def0', created_at: '2026-11-01', is_owner: true, in_my_list: true, list_synced: false,
    members: [{ user_id: 'u1', name: 'sebastian', watched_episodes: mine, is_me: true, updated_at: '' }, { user_id: 'u2', name: 'ana', watched_episodes: 5, is_me: false, updated_at: '' }],
    shared_progress: Math.min(mine, 5), my_progress: mine, waiting_for: mine > 5 ? ['ana'] : [],
  });
  api.on('GET', /^\/parties$/, () => [party(5)]);
  api.on('PATCH', /^\/parties\/.+\/progress$/, () => party(6));
  await page.goto('/together');
  await expect(page.locator('.party')).toContainText('Juntos: cap. 5 / 28');
  await page.getByRole('button', { name: 'Vi el cap. 6' }).click();
  await expect(page.locator('.party')).toContainText('Esperando a ana para contar el cap. 6');
  await expect(page.locator('.party')).toContainText('Juntos: cap. 5 / 28');
});

test('resumen del mes y tarjeta para compartir', async ({ page, api }) => {
  const stats = { month: '2026-11', episodes: 42, minutes: 1008, titles: 4, active_days: 12, best_day: { date: '2026-11-08', episodes: 9 }, longest_streak: 5,
    top_genres: [{ name: 'Fantasy', episodes: 20 }], top_studios: [{ name: 'MADHOUSE', episodes: 12 }],
    top_titles: [{ id: 'a1', title: 'Frieren', cover_url: null, episodes: 12 }], completed: [], started: 1, by_weekday: [1, 2, 3, 4, 5, 20, 7], night_owl: 3, previous_episodes: 30 };
  api.on('GET', /^\/ai\/monthly$/, (_r, url) => ({ stats, ai: url.searchParams.get('ai') === '0' ? null : { headline: 'Noviembre de fantasía', summary: 'Viviste en el mundo de Frieren.', fun_facts: ['El sábado es tu día'] } }));
  await page.goto('/stats');
  const box = page.locator('.monthly');
  await expect(box.getByRole('heading', { name: 'Noviembre de fantasía' })).toBeVisible();
  await expect(box).toContainText('42');
  await expect(box).toContainText('+40%');
  await box.getByRole('button', { name: '🖼 Compartir mi mes' }).click();
  await expect(box.getByAltText('Vista previa de la imagen para compartir')).toBeVisible({ timeout: 15_000 });
});

test('celular: barra inferior y el resto de secciones en el menú de la cuenta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  const bar = page.getByRole('navigation', { name: 'Navegación rápida' });
  await expect(bar).toBeVisible();
  await bar.getByRole('link', { name: 'Planeo ver' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByRole('button', { name: 'Cuenta y más secciones' }).click();
  await page.getByRole('link', { name: 'Amigos' }).click();
  await expect(page).toHaveURL(/\/friends$/);
  // Nada se desborda horizontalmente
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('modo oscuro por defecto y se puede cambiar a claro', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Cuenta y más secciones' }).click();
  await page.getByRole('switch', { name: /Modo oscuro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
