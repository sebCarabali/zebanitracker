import { CONFIG } from './config.js';
import { getSession, signIn, signOut } from './lib/auth.js';
import { api, AuthError } from './lib/api.js';
import { detectPage, guessNextEpisodeUrl, matchPage } from './lib/detect.js';
import { getSettings, setSetting } from './lib/settings.js';
import { jkEpisodeUrl, jkSearchUrl } from './lib/watch.js';

const $ = (id) => document.getElementById(id);
const show = (el, visible) => el.classList.toggle('hidden', !visible);

const STATUS = {
  watching: ['Viendo', '#F07B3F'],
  completed: ['Completado', '#2D4059'],
  plan_to_watch: ['Pendiente', '#9AA4B4'],
  on_hold: ['En pausa', '#D9A21B'],
  dropped: ['Abandonado', '#EA5455'],
};
const TONES = ['#002B5B', '#2D4059', '#C73E40', '#D9662C', '#1D4473', '#3E5677', '#A8383A', '#B85A28'];

let animes = [];
let tab = null;
let detected = { title: '', episode: null };
let matched = null;
let target = 1;
let lastMark = null; // { prev, episode } para deshacer
let linked = null; // anime elegido del catálogo de AniList
let searchTimer = null;

/* ---------- Utilidades ---------- */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function toneFor(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

function fillCover(node, a) {
  node.replaceChildren();
  node.style.background = toneFor(a.title);
  if (a.cover_url) node.append(el('img', { src: a.cover_url, alt: '' }));
  else node.textContent = a.title.slice(0, 1);
}

const limitOf = (a) => a.total_episodes ?? a.aired_episodes ?? null;

function relativeTime(iso) {
  const h = (new Date(iso).getTime() - Date.now()) / 3600_000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  return Math.abs(h) < 24 ? rtf.format(Math.round(h), 'hour') : rtf.format(Math.round(h / 24), 'day');
}

function msg(text, type = 'ok') {
  $('msg').textContent = text;
  $('msg').className = `small ${type}`;
  if (type === 'ok') setTimeout(() => ($('msg').textContent = ''), 3000);
}

function handleError(e) {
  if (e instanceof AuthError) return renderLogin();
  msg(e.message, 'error');
}

function replaceAnime(updated) {
  animes = animes.map((a) => (a.id === updated.id ? updated : a));
  if (matched?.id === updated.id) matched = updated;
}

/* ---------- Login ---------- */
function renderLogin() {
  show($('view-login'), true);
  show($('view-app'), false);
  show($('footer'), false);
}

$('signup-link').href = `${CONFIG.WEB_URL}/login`;
$('open-web').href = CONFIG.WEB_URL;

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await signIn($('email').value.trim(), $('password').value);
    await renderApp();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await signOut();
  renderLogin();
});

/* ---------- App ---------- */
async function renderApp() {
  const session = await getSession();
  if (!session) return renderLogin();
  show($('view-login'), false);
  show($('view-app'), true);
  show($('footer'), true);
  $('user').textContent = session.email ?? '';

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // Título de la pestaña + URL de sitios conocidos (JKAnime, AnimeFLV, MonosChinos, HiAnime…)
  detected = detectPage(tab?.url ?? '', tab?.title ?? '');

  try {
    animes = await api.list();
  } catch (e) {
    return handleError(e);
  }
  matched = matchPage(animes, detected);
  renderSettings();
  target = matched ? clampTarget(detected.episode ?? matched.watched_episodes + 1) : 1;
  renderPage();
  renderList();
}

function clampTarget(n) {
  const limit = matched ? limitOf(matched) : null;
  return Math.max(1, limit ? Math.min(limit, n) : n);
}

/* ---------- Tarjeta del anime detectado ---------- */
function renderPage() {
  show($('match'), !!matched);
  if (!matched) {
    if ($('add-form').classList.contains('hidden')) {
      show($('add-form'), true);
      prefillAdd();
    }
    return;
  }
  show($('add-form'), false);
  const a = matched;
  const limit = limitOf(a);
  fillCover($('match-cover'), a);
  $('match-title').textContent = a.title;
  $('match-progress').textContent = `Vas en el cap. ${a.watched_episodes} de ${a.total_episodes ?? (a.aired_episodes ? `${a.aired_episodes} emitidos` : '?')}`;
  $('match-bar').style.width = `${a.total_episodes ? Math.min(100, Math.round((a.watched_episodes / a.total_episodes) * 100)) : 0}%`;
  const airing = a.airing_status === 'RELEASING' && a.next_episode_at;
  show($('match-airing'), !!airing);
  if (airing) $('match-airing').textContent = `Cap. ${(a.aired_episodes ?? 0) + 1} sale ${relativeTime(a.next_episode_at)}`;

  const nextEp = Math.min(a.watched_episodes + 1, limit ?? Infinity);
  $('watch-ep').href = jkEpisodeUrl(a, nextEp);
  $('watch-ep').textContent = `Ver cap. ${nextEp} en JKAnime ↗`;
  $('watch-search').href = jkSearchUrl(a);

  show($('mark-row'), !lastMark);
  show($('done-row'), !!lastMark);
  if (lastMark) {
    $('done-text').textContent = `Cap. ${lastMark.episode} marcado como visto`;
  } else {
    $('ep-value').textContent = target;
    $('ep-dec').disabled = target <= 1;
    $('ep-inc').disabled = limit !== null && target >= limit;
    const done = limit !== null && a.watched_episodes >= limit && target <= a.watched_episodes;
    $('match-set').textContent = done ? 'Estás al día' : `Marcar cap. ${target}`;
    $('match-set').disabled = done;
  }
}

$('ep-dec').addEventListener('click', () => { target = clampTarget(target - 1); renderPage(); });
$('ep-inc').addEventListener('click', () => { target = clampTarget(target + 1); renderPage(); });

$('match-set').addEventListener('click', async () => {
  const prev = matched.watched_episodes;
  $('match-set').disabled = true;
  try {
    const pageUrl = /^https?:\/\//.test(tab?.url ?? '') ? tab.url : undefined;
    replaceAnime(await api.setProgress(matched.id, target, pageUrl));
    lastMark = { prev, episode: target };
    renderPage();
    renderList();
  } catch (e) {
    handleError(e);
    renderPage();
  }
});

$('undo').addEventListener('click', async () => {
  try {
    replaceAnime(await api.setProgress(matched.id, lastMark.prev));
    target = clampTarget(lastMark.episode);
    lastMark = null;
    renderPage();
    renderList();
  } catch (e) { handleError(e); }
});

$('match-add-new').addEventListener('click', () => {
  matched = null;
  lastMark = null;
  show($('match'), false);
  show($('add-form'), true);
  prefillAdd();
});

/* ---------- Agregar nuevo ---------- */
function prefillAdd() {
  $('add-title').value = detected.title;
  $('add-watched').value = detected.episode ?? 0;
  $('add-total').value = '';
  setLinked(null);
  searchCatalog(detected.title);
}

function setLinked(a) {
  linked = a;
  show($('linked'), !!a);
  if (a) {
    $('linked-cover').src = a.cover_url ?? '';
    const eps = a.total_episodes ?? (a.aired_episodes ? `${a.aired_episodes} emitidos` : '?');
    $('linked-text').textContent = `AniList: ${a.title} · ${eps} caps.`;
  }
}

async function searchCatalog(term) {
  const list = $('suggestions');
  if (!term || term.trim().length < 2) { show(list, false); return; }
  try {
    const results = (await api.searchCatalog(term.trim())).slice(0, 5);
    list.replaceChildren();
    for (const a of results) {
      const eps = a.total_episodes ? `${a.total_episodes} caps.` : a.aired_episodes ? `${a.aired_episodes} emitidos` : null;
      const btn = el('button', { type: 'button' },
        el('img', { src: a.cover_url ?? '', alt: '' }),
        el('span', { className: 'info' },
          el('strong', { textContent: a.title }),
          el('span', { className: 'small muted', textContent: [a.year, eps].filter(Boolean).join(' · ') }),
        ),
      );
      btn.onclick = () => {
        $('add-title').value = a.title;
        if (a.total_episodes != null) $('add-total').value = a.total_episodes;
        setLinked(a);
        show(list, false);
      };
      list.append(el('li', {}, btn));
    }
    show(list, results.length > 0 && !linked);
  } catch (e) {
    if (e instanceof AuthError) return renderLogin();
    show(list, false); // el catálogo es opcional: si AniList falla, se agrega a mano
  }
}

$('add-title').addEventListener('input', () => {
  setLinked(null);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchCatalog($('add-title').value), 450);
});
$('unlink').addEventListener('click', () => { setLinked(null); searchCatalog($('add-title').value); });

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const total = $('add-total').value;
  const isHttp = /^https?:\/\//.test(tab?.url ?? '');
  try {
    const created = await api.create({
      title: $('add-title').value.trim(),
      watched_episodes: Number($('add-watched').value || 0),
      total_episodes: total === '' ? null : Number(total),
      status: $('add-status').value,
      is_favorite: $('add-fav').checked,
      ...($('add-url').checked && isHttp ? { source_url: tab.url } : {}),
      ...(linked ? { anilist_id: linked.anilist_id, cover_url: linked.cover_url } : {}),
    });
    animes = [created, ...animes];
    matched = created;
    target = clampTarget(created.watched_episodes + 1);
    lastMark = null;
    msg(`✓ "${created.title}" agregado`);
    renderPage();
    renderList();
  } catch (err) { handleError(err); }
});

/* ---------- Mi lista ---------- */
function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const order = { watching: 0, on_hold: 1, plan_to_watch: 2, completed: 3, dropped: 4 };
  const items = animes
    .filter((a) => a.title.toLowerCase().includes(q))
    .sort((a, b) => order[a.status] - order[b.status] || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const list = $('list');
  list.replaceChildren();
  if (!items.length) {
    list.append(el('li', { className: 'muted small empty', textContent: animes.length ? 'Sin resultados' : 'Aún no tienes animes' }));
    return;
  }
  for (const a of items) {
    const [label, color] = STATUS[a.status] ?? STATUS.watching;
    const limit = limitOf(a);
    const done = limit !== null && a.watched_episodes >= limit;
    const pct = a.total_episodes ? Math.min(100, Math.round((a.watched_episodes / a.total_episodes) * 100)) : 0;

    const cover = el('div', { className: 'cover' });
    fillCover(cover, a);

    const fav = el('button', {
      className: `fav ${a.is_favorite ? 'on' : ''}`, textContent: a.is_favorite ? '★' : '☆',
      ariaLabel: a.is_favorite ? `Quitar ${a.title} de favoritos` : `Agregar ${a.title} a favoritos`,
    });
    fav.setAttribute('aria-pressed', String(a.is_favorite));
    fav.onclick = () => update(api.toggleFavorite(a.id));

    const isJk = /jkanime\./i.test(a.last_episode_url ?? '');
    const nextUrl = (!isJk && guessNextEpisodeUrl(a.last_episode_url, a.watched_episodes))
      || (!done ? jkEpisodeUrl(a, a.watched_episodes + 1) : null);
    const open = nextUrl
      ? el('a', { className: 'btn', href: nextUrl, target: '_blank', textContent: '▶', title: `Abrir cap. ${a.watched_episodes + 1}` })
      : null;
    if (open) open.setAttribute('aria-label', `Abrir capítulo ${a.watched_episodes + 1} de ${a.title}`);

    const next = el('button', { className: 'btn', textContent: done ? '✓' : '+1', disabled: done });
    next.setAttribute('aria-label', done ? `${a.title}: al día` : `Marcar capítulo ${a.watched_episodes + 1} de ${a.title}`);
    next.onclick = () => update(api.next(a.id));

    const bar = el('div', { className: 'bar' }, el('div'));
    bar.firstChild.style.width = `${pct}%`;
    bar.firstChild.style.background = color;

    const dot = el('span', { className: 'dot' });
    dot.style.background = color;

    list.append(el('li', { className: 'item' },
      cover,
      el('div', { className: 'info' },
        el('span', { className: 'title', textContent: a.title, title: a.title }),
        el('span', { className: 'meta' }, dot, `${label} · ${a.watched_episodes}/${a.total_episodes ?? a.aired_episodes ?? '?'}`),
        bar,
      ),
      fav,
      ...(open ? [open] : []),
      next,
    ));
  }
}

async function update(promise) {
  try {
    replaceAnime(await promise);
    renderList();
    renderPage();
  } catch (e) { handleError(e); }
}

$('search').addEventListener('input', renderList);

renderApp();

/* ---------- Ajustes ---------- */
async function renderSettings() {
  const s = await getSettings();
  for (const key of ['autoMark', 'suggestAdd', 'staleReminders']) {
    const input = document.querySelector(`[data-setting="${key}"]`);
    if (!input) continue;
    input.checked = !!s[key];
    input.onchange = () => setSetting(key, input.checked).then(() => msg('Ajuste guardado'));
  }
}
