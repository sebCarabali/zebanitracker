import { test, expect, anime } from './fixtures';

test('Mi lista muestra estadísticas, continúa viendo y la biblioteca', async ({ page, api }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Sebastian' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continúa viendo' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Todos/ })).toContainText('4');
  await expect(page.locator('.card')).toHaveCount(4);
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
