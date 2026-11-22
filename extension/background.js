import { CONFIG } from './config.js';
import { getSession } from './lib/auth.js';
import { api } from './lib/api.js';
import { detectPage, matchPage } from './lib/detect.js';
import { getSettings as settings } from './lib/settings.js';

const ALARM = 'check-episodes';
const ICON = 'icons/icon128.png';
const DAY = 86_400_000;


/* ---------- Revisión periódica: capítulos nuevos y series abandonadas ---------- */
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 60, delayInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  if (!(await getSession())) return;
  try {
    await api.syncEpisodes().catch(() => null); // refresca emisión desde AniList (el servidor limita la frecuencia)
    const animes = await api.list();
    listCache = { at: Date.now(), animes };
    const { notified = {} } = await chrome.storage.local.get('notified');
    const next = { ...notified };

    for (const a of animes) {
      if (a.status !== 'watching' || a.aired_episodes == null) continue;
      const already = notified[a.id];
      // Primera vez que vemos este anime: solo guardamos el estado, sin avisar de capítulos viejos
      if (already === undefined) { next[a.id] = a.aired_episodes; continue; }
      if (a.aired_episodes > already && a.aired_episodes > a.watched_episodes) {
        chrome.notifications.create(`new:${a.id}`, {
          type: 'basic',
          iconUrl: ICON,
          title: `Nuevo capítulo de ${a.title}`,
          message: `Ya salió el cap. ${a.aired_episodes}. Vas en el ${a.watched_episodes}.`,
          priority: 1,
        });
      }
      next[a.id] = a.aired_episodes;
    }
    await chrome.storage.local.set({ notified: next });
    await staleReminders();
  } catch {
    /* sin conexión o sesión expirada: se reintenta en la próxima alarma */
  }
});

/** "¿Lo retomas o lo dejas?" — como mucho una vez al día y cada serie cada 7 días si no respondes. */
async function staleReminders() {
  if (!(await settings()).staleReminders) return;
  const { staleCheckedAt = 0, staleAsked = {} } = await chrome.storage.local.get(['staleCheckedAt', 'staleAsked']);
  if (Date.now() - staleCheckedAt < DAY) return;
  await chrome.storage.local.set({ staleCheckedAt: Date.now() });
  const { items = [] } = (await api.stale().catch(() => null)) ?? {};
  const asked = { ...staleAsked };
  for (const a of items.filter((x) => Date.now() - (staleAsked[x.id] ?? 0) > 7 * DAY).slice(0, 2)) {
    asked[a.id] = Date.now();
    chrome.notifications.create(`stale:${a.id}`, {
      type: 'basic',
      iconUrl: ICON,
      title: `¿Retomas ${a.title} o lo dejas?`,
      message: `Vas en el cap. ${a.watched_episodes} y no avanzas hace ${a.idle_days} días.`,
      buttons: [{ title: '▶ Lo retomo' }, { title: '✕ Lo dejo' }],
      requireInteraction: true,
    });
  }
  await chrome.storage.local.set({ staleAsked: asked });
}

/* ---------- Detección de la página: icono con ✓ (en tu lista) o + (no lo tienes) ---------- */
let listCache = { at: 0, animes: [] };
const asked = new Set(); // URLs ya resueltas en esta sesión del navegador

async function cachedList(force = false) {
  if (!force && Date.now() - listCache.at < 5 * 60_000) return listCache.animes;
  listCache = { at: Date.now(), animes: await api.list() };
  return listCache.animes;
}

/** Busca en AniList el anime de la página cuando no está en tu lista (solo si el título coincide de verdad). */
const catalogCache = new Map();
async function findInCatalog(d) {
  const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  for (const q of [d.title, d.altTitle].filter((t) => t && t.length >= 3)) {
    const key = norm(q);
    if (!catalogCache.has(key)) catalogCache.set(key, await api.searchCatalog(q).catch(() => []));
    const hit = catalogCache.get(key).find((m) =>
      [m.title, m.title_romaji, m.title_english].some((t) => {
        const n = norm(t);
        return n && (n === key || (key.length >= 6 && (n.startsWith(key) || key.startsWith(n))));
      }));
    if (hit) return hit;
  }
  return null;
}

async function updateBadge(tab) {
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) return;
  if (!(await getSession())) return;
  const d = detectPage(tab.url, tab.title);
  if (!d.episode && !d.site) { chrome.action.setBadgeText({ tabId: tab.id, text: '' }); return; }
  const anime = matchPage(await cachedList().catch(() => []), d);
  if (anime) {
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#2D4059' });
    chrome.action.setBadgeText({ tabId: tab.id, text: d.episode && d.episode > anime.watched_episodes ? String(d.episode) : '✓' });
    chrome.action.setTitle({ tabId: tab.id, title: `${anime.title}: vas en el cap. ${anime.watched_episodes}` });
  } else if (d.site) {
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#EA5455' });
    chrome.action.setBadgeText({ tabId: tab.id, text: '+' });
    chrome.action.setTitle({ tabId: tab.id, title: `${d.title || 'Este anime'} no está en tu lista` });
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return;
  if (msg?.type === 'page-loaded') updateBadge(sender.tab).catch(() => {});
  if (msg?.type === 'video-almost-done') handleVideoDone(sender.tab).catch(() => {});
});

/* ---------- Video casi terminado → marcar solo (o proponer agregarlo) ---------- */
async function handleVideoDone(tab) {
  const url = tab.url ?? '';
  if (!/^https?:/.test(url) || asked.has(url)) return;
  if (!(await getSession())) return;
  asked.add(url);
  const s = await settings();
  const d = detectPage(url, tab.title ?? '');
  const list = await cachedList();
  const anime = matchPage(list, d);

  if (!anime) {
    // Solo en sitios reconocidos o con "Episodio N" en el título, para no confundir videos cualquiera
    if (!s.suggestAdd || (!d.site && !d.episode)) return;
    const media = await findInCatalog(d);
    if (!media) return;
    const episode = d.episode ?? 1;
    const id = `add:${media.anilist_id}:${Date.now()}`;
    await chrome.storage.session.set({ [id]: { media, episode, url, jk: d.jk } });
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: ICON,
      title: `¿Agregar ${media.title} a tu lista?`,
      message: `Terminaste el cap. ${episode} y no lo tienes en ZebaniTracker.`,
      buttons: [{ title: `Agregar y marcar cap. ${episode}` }, { title: 'No es este anime' }],
      requireInteraction: true,
    });
    return;
  }

  const limit = anime.total_episodes ?? null;
  const episode = d.episode ?? anime.watched_episodes + 1;
  if (episode <= anime.watched_episodes || (limit !== null && episode > limit)) return; // ya marcado o fuera de rango

  if (s.autoMark) {
    try {
      const before = anime.watched_episodes;
      const updated = await api.setProgress(anime.id, episode, url);
      listCache.at = 0;
      const id = `auto:${anime.id}:${Date.now()}`;
      await chrome.storage.session.set({ [id]: { animeId: anime.id, prev: before } });
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: ICON,
        title: `✓ Cap. ${episode} marcado`,
        message: updated.status === 'completed' ? `${updated.title}: ¡terminado! 🎉` : `${updated.title}: vas en el cap. ${updated.watched_episodes}`,
        buttons: [{ title: 'Deshacer' }],
      });
      updateBadge(tab).catch(() => {});
    } catch (e) {
      chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'No se pudo marcar', message: e.message });
    }
    return;
  }

  const id = `mark:${anime.id}:${episode}:${Date.now()}`;
  await chrome.storage.session.set({ [id]: { animeId: anime.id, title: anime.title, episode, url } });
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: ICON,
    title: `¿Terminaste el cap. ${episode}?`,
    message: anime.title,
    buttons: [{ title: `Marcar cap. ${episode} como visto` }, { title: 'Ahora no' }],
    requireInteraction: true,
  });
}

chrome.notifications.onButtonClicked.addListener(async (id, button) => {
  const kind = id.split(':')[0];
  if (kind === 'stale') {
    chrome.notifications.clear(id);
    const animeId = id.slice(6);
    try {
      await api.staleAction(animeId, button === 0 ? 'resume' : 'drop');
      listCache.at = 0;
      if (button === 0) chrome.tabs.create({ url: `${CONFIG.WEB_URL}/animes/${animeId}` });
      else chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'Marcado como abandonado', message: 'Puedes retomarlo cuando quieras desde tu lista.' });
    } catch (e) {
      chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'No se pudo guardar', message: e.message });
    }
    return;
  }
  if (!['mark', 'auto', 'add'].includes(kind)) return;
  const { [id]: pending } = await chrome.storage.session.get(id);
  chrome.notifications.clear(id);
  await chrome.storage.session.remove(id);
  if (!pending || button !== 0) return;
  try {
    if (kind === 'auto') {
      const updated = await api.setProgress(pending.animeId, pending.prev);
      listCache.at = 0;
      chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'Deshecho', message: `${updated.title}: vuelves al cap. ${updated.watched_episodes}` });
      return;
    }
    if (kind === 'add') {
      const m = pending.media;
      const total = m.total_episodes ?? null;
      const created = await api.create({
        title: m.title, anilist_id: m.anilist_id, cover_url: m.cover_url, total_episodes: total,
        watched_episodes: total !== null ? Math.min(pending.episode, total) : pending.episode,
        status: total !== null && pending.episode >= total ? 'completed' : 'watching',
        // En JKAnime se guarda la página de la serie para aprender el enlace exacto
        source_url: pending.jk ? new URL(`/${pending.jk.slug}/`, pending.url).toString() : m.site_url,
        last_episode_url: pending.url,
      });
      listCache.at = 0;
      chrome.notifications.create(`open:${created.id}`, {
        type: 'basic', iconUrl: ICON, title: '✓ Agregado a tu lista',
        message: `${created.title}: vas en el cap. ${created.watched_episodes}`,
      });
      return;
    }
    const updated = await api.setProgress(pending.animeId, pending.episode, pending.url);
    listCache.at = 0;
    chrome.notifications.create({
      type: 'basic', iconUrl: ICON,
      title: '✓ Capítulo marcado',
      message: `${updated.title}: vas en el cap. ${updated.watched_episodes}`,
    });
  } catch (e) {
    chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'No se pudo guardar', message: e.message });
  }
});

chrome.notifications.onClicked.addListener((id) => {
  const [kind, animeId] = id.split(':');
  if (kind === 'new' || kind === 'open' || kind === 'stale') {
    chrome.tabs.create({ url: `${CONFIG.WEB_URL}/animes/${animeId}` });
    chrome.notifications.clear(id);
  }
});
