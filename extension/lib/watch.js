import { CONFIG } from '../config.js';
import { detectFromJkUrl, slugify } from './detect.js';

const base = () => (CONFIG.WATCH_BASE || 'https://jkanime.net').replace(/\/+$/, '');

/** Slug de JKAnime: el aprendido de una URL guardada o el derivado del romaji. */
export function jkSlug(a) {
  const known = detectFromJkUrl(a.last_episode_url ?? '')?.slug ?? detectFromJkUrl(a.source_url ?? '')?.slug;
  return known ?? slugify(a.title_romaji || a.title);
}

export const jkEpisodeUrl = (a, n) => `${base()}/${jkSlug(a)}/${Math.max(1, n)}/`;

export function jkSearchUrl(a) {
  const q = (a.title_romaji || a.title).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return `${base()}/buscar/${encodeURIComponent(q)}/`;
}
