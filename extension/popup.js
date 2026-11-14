import { CONFIG } from './config.js';
import { getSession, signIn, signOut } from './lib/auth.js';
import { api, AuthError } from './lib/api.js';
import { detectFromTab, findMatch } from './lib/detect.js';

const $ = (id) => document.getElementById(id);
const show = (el, visible) => el.classList.toggle('hidden', !visible);

let animes = [];
let tab = null;
let detected = { title: '', episode: null };
let matched = null;

function msg(text, type = 'ok') {
  $('msg').textContent = text;
  $('msg').className = `small ${type}`;
  if (type === 'ok') setTimeout(() => ($('msg').textContent = ''), 3000);
}

function handleError(e) {
  if (e instanceof AuthError) return renderLogin();
  msg(e.message, 'error');
}

/* ---------- Login ---------- */
function renderLogin() {
  show($('view-login'), true);
  show($('view-app'), false);
  show($('logout'), false);
  $('user').textContent = '';
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
  show($('logout'), true);
  $('user').textContent = session.email ?? '';

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  detected = detectFromTab(tab?.title ?? '');

  try {
    animes = await api.list();
  } catch (e) {
    return handleError(e);
  }
  renderPageTab();
  renderList();
}

function renderPageTab() {
  matched = findMatch(animes, detected.title);
  show($('match'), !!matched);
  show($('add-form'), !matched);

  if (matched) {
    $('match-title').textContent = matched.title;
    $('match-progress').textContent = `Vas en el capítulo ${matched.watched_episodes} de ${matched.total_episodes ?? '?'}`;
    $('match-episode').value = detected.episode ?? matched.watched_episodes + 1;
    if (matched.total_episodes != null) $('match-episode').max = matched.total_episodes;
  } else {
    $('add-title').value = detected.title;
    $('add-watched').value = detected.episode ?? 0;
  }
}

$('match-set').addEventListener('click', async () => {
  const ep = Number($('match-episode').value);
  try {
    const updated = await api.setProgress(matched.id, ep);
    animes = animes.map((a) => (a.id === updated.id ? updated : a));
    msg(`✓ ${updated.title}: capítulo ${updated.watched_episodes} marcado`);
    renderPageTab();
    renderList();
  } catch (e) { handleError(e); }
});

$('match-add-new').addEventListener('click', () => {
  show($('match'), false);
  show($('add-form'), true);
  $('add-title').value = detected.title;
  $('add-watched').value = detected.episode ?? 0;
});

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
    });
    animes = [created, ...animes];
    msg(`✓ "${created.title}" agregado`);
    renderPageTab();
    renderList();
  } catch (err) { handleError(err); }
});

/* ---------- Lista ---------- */
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function renderList() {
  const q = $('search').value.trim().toLowerCase();
  const items = animes.filter((a) => a.title.toLowerCase().includes(q));
  const list = $('list');
  list.replaceChildren();
  if (!items.length) {
    list.append(el('li', { className: 'muted small', textContent: animes.length ? 'Sin resultados' : 'Aún no tienes animes' }));
    return;
  }
  for (const a of items) {
    const pct = a.total_episodes ? Math.round((a.watched_episodes / a.total_episodes) * 100) : 0;
    const done = a.total_episodes != null && a.watched_episodes >= a.total_episodes;

    const fav = el('button', { className: `fav ${a.is_favorite ? 'on' : ''}`, textContent: a.is_favorite ? '★' : '☆', title: 'Favorito' });
    fav.onclick = () => update(api.toggleFavorite(a.id));

    const input = el('input', { type: 'number', min: 0, value: a.watched_episodes, className: 'ep-input' });
    if (a.total_episodes != null) input.max = a.total_episodes;
    const set = el('button', { className: 'btn', textContent: 'Fijar' });
    set.onclick = () => update(api.setProgress(a.id, Number(input.value)));
    const next = el('button', { className: 'btn primary grow', textContent: done ? 'Terminado' : `+1 (cap. ${a.watched_episodes + 1})`, disabled: done });
    next.onclick = () => update(api.next(a.id));

    list.append(
      el('li', {},
        el('div', { className: 'row' }, el('span', { className: 'title grow', textContent: a.title, title: a.title }), fav),
        el('div', { className: 'bar' }, el('div', { style: `width:${pct}%` })),
        el('span', { className: 'small muted', textContent: `${a.watched_episodes} / ${a.total_episodes ?? '?'}` }),
        el('div', { className: 'row' }, input, set, next),
      ),
    );
  }
}

async function update(promise) {
  try {
    const updated = await promise;
    animes = animes.map((a) => (a.id === updated.id ? updated : a));
    renderList();
    renderPageTab();
  } catch (e) { handleError(e); }
}

$('search').addEventListener('input', renderList);

document.querySelectorAll('.tabs button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    show($('tab-page'), btn.dataset.tab === 'page');
    show($('tab-list'), btn.dataset.tab === 'list');
  }),
);

renderApp();
