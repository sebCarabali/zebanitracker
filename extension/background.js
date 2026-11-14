import { CONFIG } from './config.js';
import { getSession } from './lib/auth.js';
import { api } from './lib/api.js';
import { detectFromTab, findMatch } from './lib/detect.js';

const ALARM = 'check-episodes';
const ICON = 'icons/icon128.png';

/* ---------- Revisión periódica de capítulos nuevos ---------- */
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
  } catch {
    /* sin conexión o sesión expirada: se reintenta en la próxima alarma */
  }
});

/* ---------- Video casi terminado → ofrecer marcar el capítulo ---------- */
let listCache = { at: 0, animes: [] };
const asked = new Set(); // URLs para las que ya se preguntó en esta sesión del navegador

async function cachedList() {
  if (Date.now() - listCache.at < 5 * 60_000) return listCache.animes;
  listCache = { at: Date.now(), animes: await api.list() };
  return listCache.animes;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'video-almost-done' || !sender.tab) return;
  handleVideoDone(sender.tab).catch(() => {});
});

async function handleVideoDone(tab) {
  const url = tab.url ?? '';
  if (!/^https?:/.test(url) || asked.has(url)) return;
  if (!(await getSession())) return;
  asked.add(url);

  const detected = detectFromTab(tab.title ?? '');
  const anime = findMatch(await cachedList(), detected.title);
  if (!anime) return;
  const episode = detected.episode ?? anime.watched_episodes + 1;
  if (episode <= anime.watched_episodes) return; // ya lo tenías marcado

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
  if (!id.startsWith('mark:')) return;
  const { [id]: pending } = await chrome.storage.session.get(id);
  chrome.notifications.clear(id);
  await chrome.storage.session.remove(id);
  if (!pending || button !== 0) return;
  try {
    const updated = await api.setProgress(pending.animeId, pending.episode, pending.url);
    listCache.at = 0;
    chrome.notifications.create({
      type: 'basic', iconUrl: ICON,
      title: '✓ Capítulo marcado',
      message: `${updated.title}: vas en el cap. ${updated.watched_episodes}`,
    });
  } catch (e) {
    chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'No se pudo marcar', message: e.message });
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('new:')) {
    chrome.tabs.create({ url: `${CONFIG.WEB_URL}/animes/${id.slice(4)}` });
    chrome.notifications.clear(id);
  }
});
