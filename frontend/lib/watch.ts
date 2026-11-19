/**
 * Enlaces para ver en JKAnime.
 * - Búsqueda:  {base}/buscar/{título}/
 * - Episodio:  {base}/{slug}/{n}/   (el slug suele ser el título en romaji: "sousou-no-frieren")
 * El slug exacto se aprende de la página que el usuario pegó en "Dónde lo veo" o desde la que marcó un capítulo;
 * si no hay, se adivina a partir del romaji.
 * El dominio cambia con el tiempo (jkanime.net/.org/.bz…), por eso es configurable en Ajustes.
 */
export const DEFAULT_WATCH_BASE = 'https://jkanime.net';
const KEY = 'zt-watch-base';
const RESERVED = new Set(['buscar', 'directorio', 'horario', 'genero', 'letra', 'top', 'ver', 'tipo', 'login', 'perfil']);

export function getWatchBase(): string {
  try { return (localStorage.getItem(KEY) || DEFAULT_WATCH_BASE).replace(/\/+$/, ''); } catch { return DEFAULT_WATCH_BASE; }
}

export function setWatchBase(url: string) {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean || clean === DEFAULT_WATCH_BASE) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, new URL(clean).origin);
  } catch { /* URL inválida: se ignora */ }
}

export const isJkUrl = (url?: string | null) => {
  if (!url) return false;
  try { return /(^|\.)jkanime\./i.test(new URL(url).hostname); } catch { return false; }
};

/** "Sousou no Frieren" → "sousou-no-frieren" */
export function slugify(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Slug tomado de una URL de JKAnime (página del anime o de un episodio). */
export function slugFromUrl(url?: string | null): string | null {
  if (!isJkUrl(url)) return null;
  const seg = new URL(url!).pathname.split('/').filter(Boolean)[0];
  return seg && !RESERVED.has(seg) ? seg : null;
}

export interface WatchTarget {
  title: string;
  title_romaji?: string | null;
  source_url?: string | null;
  last_episode_url?: string | null;
}

/** Slug conocido (de una URL guardada) o adivinado. `known` indica si es seguro. */
export function jkSlug(a: WatchTarget): { slug: string; known: boolean } {
  const known = slugFromUrl(a.last_episode_url) ?? slugFromUrl(a.source_url);
  if (known) return { slug: known, known: true };
  return { slug: slugify(a.title_romaji || a.title), known: false };
}

export function jkEpisodeUrl(a: WatchTarget, episode: number): string {
  return `${getWatchBase()}/${jkSlug(a).slug}/${Math.max(1, episode)}/`;
}

export function jkSearchUrl(a: WatchTarget): string {
  const q = (a.title_romaji || a.title).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return `${getWatchBase()}/buscar/${encodeURIComponent(q)}/`;
}
