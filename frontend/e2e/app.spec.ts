import { test, expect, anime } from './fixtures';

test('Mi lista muestra estadísticas, continúa viendo y la biblioteca', async ({ page, api }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Sebastian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continúa viendo' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('5');
  await expect(page.locator('.card')).toHaveCount(5);
  expect(api.calls.some((c) => c.path === '/animes/sync-episodes')).toBeTruthy();
});

test('marcar el siguiente capítulo desde "Continúa viendo"', async ({ page, api }) => {
  await page.goto('/');
  const card = page.locator('.continue', { hasText: 'Frieren' });
  await card.getByRole('button', { name: 'Visto cap. 13' }).click();
  await expect(card.getByRole('button', { name: 'Visto cap. 14' })).toBeVisible();
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/animes/a1/progress/next')).toBeTruthy();
});

test('"Abrir siguiente" adivina la URL del próximo capítulo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Abrir cap. 8/ })).toHaveAttribute('href', 'https://example.com/ver/dandadan-8');
});

test('filtrar por estado y ordenar por puntuación', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /Completados/ }).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card')).toContainText('Solo Leveling');
  await page.getByRole('tab', { name: /Todos/ }).click();
  await page.getByLabel('Ordenar').selectOption('score');
  await expect(page.locator('.card').first()).toContainText('Solo Leveling');
});

test('detalle: tocar un capítulo fija el progreso y se puede puntuar', async ({ page, api }) => {
  api.on('PATCH', /^\/animes\/a1\/progress$/, (_r, _u, body) => anime({ watched_episodes: (body as { episode: number }).episode }));
  api.on('PATCH', /^\/animes\/a1$/, (_r, _u, body) => anime(body as Record<string, unknown>));
  await page.goto('/animes/a1');
  await page.getByRole('button', { name: 'Capítulo 20', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capítulo 20, visto' })).toBeVisible();
  expect(api.calls.find((c) => c.path === '/animes/a1/progress')?.body).toEqual({ episode: 20 });

  await page.getByRole('radio', { name: '8 de 10' }).click();
  await expect.poll(() => api.calls.find((c) => c.method === 'PATCH' && c.path === '/animes/a1')?.body).toEqual({ score: 8 });
});

test('calendario muestra el próximo estreno', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  await expect(page.locator('.slot', { hasText: 'Dandadan' })).toContainText('Cap. 9');
});

test('explorar envía los filtros a la API', async ({ page, api }) => {
  await page.goto('/explore');
  await page.getByRole('radio', { name: 'Otoño' }).click();
  await page.getByRole('button', { name: 'Fantasy' }).click();
  await expect.poll(() => api.calls.some((c) => c.path.startsWith('/catalog/browse') && c.path.includes('season=FALL') && c.path.includes('genres=Fantasy'))).toBeTruthy();
});

test('estadísticas calculan horas y racha', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.getByText('Horas vistas')).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Racha actual' })).toContainText('1 día');
  await expect(page.locator('.stat', { hasText: 'Puntuación media' })).toContainText('9.0');
});

test('lista pública se ve sin sesión', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.route('http://api.e2e.test/api/public/sebas', (r) => r.fulfill({
    contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ username: 'sebas', animes: [{ title: 'Frieren', status: 'watching', watched_episodes: 12, total_episodes: 28, is_favorite: true, score: 10, cover_url: null, anilist_id: 1, genres: [], format: 'TV', season_year: 2023 }] }),
  }));
  await page.goto('/u/sebas');
  await expect(page.getByRole('heading', { name: '@sebas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Crea tu lista' })).toBeVisible();
  await expect(page.locator('.card')).toContainText('Frieren');
});

test('enlaces a JKAnime: capítulo siguiente, búsqueda y "ir al capítulo"', async ({ page, context }) => {
  await page.goto('/');
  const card = page.locator('.continue', { hasText: 'Frieren' });
  await expect(card.getByRole('link', { name: 'Ver cap. 13 en JKAnime ↗' })).toHaveAttribute('href', 'https://jkanime.net/sousou-no-frieren/13/');
  await expect(card.getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', 'https://jkanime.net/buscar/Sousou%20no%20Frieren/');

  const opened: string[] = [];
  await context.route('https://jkanime.net/**', (r) => { opened.push(r.request().url()); return r.fulfill({ body: 'ok' }); });
  await page.goto('/animes/a1');
  await page.getByLabel('Número de capítulo').fill('20');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Abrir ↗' }).click()]);
  await popup.waitForLoadState();
  expect(opened).toContain('https://jkanime.net/sousou-no-frieren/20/');
});

test('el slug exacto se aprende de "Dónde lo veo" y el dominio se configura', async ({ page, api }) => {
  api.on('GET', /^\/animes\/a1$/, () => anime({ source_url: 'https://jkanime.net/sousou-no-frieren-tv/' }));
  await page.goto('/settings');
  await page.getByLabel(/Dominio de JKAnime/).fill('https://jkanime.org');
  await page.locator('form', { hasText: 'Dominio de JKAnime' }).getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/animes/a1');
  await expect(page.getByRole('link', { name: 'Ver cap. 13 en JKAnime ↗' })).toHaveAttribute('href', 'https://jkanime.org/sousou-no-frieren-tv/13/');
  await expect(page.getByText('El enlace al capítulo se arma con el título en romaji')).toHaveCount(0);
});

test('agrupar temporadas muestra una tarjeta por serie con el avance total', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card')).toHaveCount(5);
  await page.getByLabel('Agrupar temporadas').check();
  await expect(page.locator('.card')).toHaveCount(4);
  const solo = page.locator('.card', { hasText: 'Solo Leveling' });
  await expect(solo).toContainText('1/2 temporadas vistas');
  await expect(solo).toContainText('T2 · Solo Leveling Season 2');
  await expect(solo).toContainText('16/25 en total');
});

test('panel de temporadas: estado por temporada y agregar las que faltan', async ({ page, api }) => {
  const media = (id: number, title: string, format = 'TV') => ({ anilist_id: id, title, title_romaji: title, title_english: title, total_episodes: 12,
    aired_episodes: 12, cover_url: null, site_url: 'https://anilist.co', format, year: 2024, season: 'WINTER', airing_status: 'FINISHED', genres: [],
    score: 80, next_episode_at: null, next_episode: null, mal_id: null, studios: [] });
  api.on('GET', /^\/catalog\/anime\/30\/seasons$/, () => ({ root: 3, entries: [
    { media: media(3, 'Solo Leveling'), start: '2024-01-06', season_number: 1, label: 'Temporada 1' },
    { media: media(30, 'Solo Leveling Season 2'), start: '2025-01-04', season_number: 2, label: 'Temporada 2' },
    { media: media(31, 'Solo Leveling Season 3'), start: '2026-10-01', season_number: 3, label: 'Temporada 3' },
    { media: media(32, 'Solo Leveling: ReAwakening', 'MOVIE'), start: '2024-11-29', season_number: null, label: 'Película' },
  ] }));
  api.on('POST', /^\/animes\/batch$/, (_r, _u, body) => (body as { items: { anilist_id: number; status: string }[] }).items.map((i, n) =>
    anime({ id: `new${n}`, anilist_id: i.anilist_id, status: i.status, title: 'Solo Leveling Season 3', watched_episodes: 0, total_episodes: 12 })));

  await page.goto('/animes/a5');
  const panel = page.locator('section.seasons');
  await expect(panel).toContainText('3 temporadas · 1 película/extra');
  await expect(panel.locator('li.current')).toContainText('Temporada 2 · estás aquí');
  await expect(panel.locator('li', { hasText: 'Temporada 1' })).toContainText('Completado · 12/12');
  await expect(panel.locator('li', { hasText: 'Película' })).toHaveCount(0); // extras ocultos por defecto

  await panel.getByRole('button', { name: 'Agregar la que falta' }).click();
  await expect(panel.locator('li', { hasText: 'Temporada 3' })).toContainText('Pendiente · 0/12');
  expect(api.calls.find((c) => c.path === '/animes/batch')?.body).toEqual({ items: [{ anilist_id: 31, status: 'plan_to_watch' }] });

  await panel.getByRole('button', { name: 'Ver películas y extras' }).click();
  await expect(panel.locator('li', { hasText: 'Película' })).toContainText('Solo Leveling: ReAwakening');
});

test('recomendaciones con IA: se generan solas, explican el porqué y aceptan pedidos', async ({ page, api }) => {
  const media = (id: number, title: string) => ({ anilist_id: id, title, title_romaji: title, title_english: title, total_episodes: 12, aired_episodes: 12,
    cover_url: null, site_url: 'https://anilist.co', format: 'TV', year: 2023, season: 'FALL', airing_status: 'FINISHED', genres: ['Mystery'],
    score: 85, next_episode_at: null, next_episode: null, mal_id: null, studios: [] });
  api.on('POST', /^\/ai\/recommendations$/, (_r, _u, body) => {
    const req = (body as { request?: string }).request;
    return {
      summary: req ? 'Tres historias cortas de misterio.' : 'Te gusta la fantasía contemplativa y las historias con buen cierre.',
      request: req ?? null, generated_at: new Date().toISOString(), lang: 'es',
      items: [{ media: media(100, req ? 'Odd Taxi' : 'The Apothecary Diaries'), reason: 'Porque puntuaste alto Frieren y te gustan los misterios pausados.' }],
    };
  });
  await page.goto('/');
  const section = page.locator('section.ai-section');
  await expect(section).toContainText('Te gusta la fantasía contemplativa');
  await expect(section.locator('.ai-card')).toContainText('Porque puntuaste alto Frieren');
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/ai/recommendations')).toBeTruthy();

  await section.getByPlaceholder(/Qué te apetece/).fill('algo corto de misterio');
  await section.getByRole('button', { name: 'Pedir' }).click();
  await expect(section.locator('.ai-card')).toContainText('Odd Taxi');
  expect(api.calls.filter((c) => c.path === '/ai/recommendations').at(-1)?.body).toEqual({ request: 'algo corto de misterio' });
});

test('sinopsis traducida con IA y opción de ver el original', async ({ page, api }) => {
  api.on('GET', /^\/catalog\/anime\/154587$/, () => ({ anilist_id: 154587, title: 'Frieren', title_romaji: 'Sousou no Frieren', title_english: 'Frieren',
    total_episodes: 28, aired_episodes: 28, cover_url: null, cover_large_url: null, banner_url: null, site_url: 'https://anilist.co', format: 'TV', year: 2023,
    season: 'FALL', airing_status: 'FINISHED', next_episode_at: null, next_episode: null, genres: ['Adventure'], score: 90, description: 'The adventure is over.',
    duration: 24, studios: ['MADHOUSE'], source: 'MANGA', start_date: '2023-09-29', end_date: '2024-03-22', popularity: 1, tags: [], trailer_url: null,
    relations: [], mal_id: 52991 }));
  api.on('GET', /^\/ai\/description\/154587$/, () => ({ lang: 'es', text: 'La aventura terminó.', original: 'The adventure is over.', translated: true }));
  await page.goto('/explore/154587');
  await expect(page.locator('.synopsis')).toHaveText('La aventura terminó.');
  await expect(page.getByText('✦ Traducido con IA al español')).toBeVisible();
  await page.getByRole('button', { name: 'Ver original (inglés)' }).click();
  await expect(page.locator('.synopsis')).toHaveText('The adventure is over.');
});

test('si la IA responde vacío o incompleto, Mi lista no se rompe', async ({ page, api }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  api.on('GET', /^\/ai\/recommendations$/, () => ({}));
  api.on('POST', /^\/ai\/recommendations$/, () => ({}));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mi biblioteca' })).toBeVisible();
  await expect(page.locator('section.ai-section')).toContainText('Pulsa “Otras recomendaciones”');
  expect(errors).toEqual([]);
});

test('la sinopsis traducida se guarda en el navegador y no se vuelve a pedir', async ({ page, api }) => {
  api.on('GET', /^\/catalog\/anime\/154587$/, () => ({ anilist_id: 154587, title: 'Frieren', title_romaji: 'Sousou no Frieren', title_english: 'Frieren',
    total_episodes: 28, aired_episodes: 28, cover_url: null, cover_large_url: null, banner_url: null, site_url: 'https://anilist.co', format: 'TV', year: 2023,
    season: 'FALL', airing_status: 'FINISHED', next_episode_at: null, next_episode: null, genres: [], score: 90, description: 'The adventure is over.',
    duration: 24, studios: [], source: 'MANGA', start_date: null, end_date: null, popularity: 1, tags: [], trailer_url: null, relations: [], mal_id: null }));
  api.on('GET', /^\/ai\/description\/154587$/, () => ({ lang: 'es', text: 'La aventura terminó.', original: 'The adventure is over.', translated: true }));
  await page.goto('/explore/154587');
  await expect(page.locator('.synopsis')).toHaveText('La aventura terminó.');
  await page.reload();
  await expect(page.locator('.synopsis')).toHaveText('La aventura terminó.');
  expect(api.calls.filter((c) => c.path === '/ai/description/154587')).toHaveLength(1);
});
