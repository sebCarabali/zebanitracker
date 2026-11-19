/**
 * Heurística para sacar título y número de capítulo del título de la pestaña.
 * Ej: "Ver Frieren Episodio 12 Sub Español - AnimeFLV" → { title: "Frieren", episode: 12 }
 */
const EP_RE = /\b(?:episodio|episode|cap[ií]tulo|cap|ep|e)\.?\s*#?\s*(\d{1,4})\b/i;

export function detectFromTab(tabTitle = '') {
  let raw = tabTitle.split(/\s[|\-–—]\s(?=[^|\-–—]*$)/)[0]; // quita " - NombreDelSitio" final
  const m = raw.match(EP_RE) || tabTitle.match(EP_RE);
  const episode = m ? Number(m[1]) : null;
  if (m) raw = raw.slice(0, raw.search(EP_RE)) || raw;
  const title = raw
    .replace(/^(ver|watch)\s+/i, '')
    .replace(/\b(sub|dub|español|espanol|latino|online|hd|gratis|free)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–—|:]+$/, '')
    .trim();
  return { title, episode };
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Busca en la lista un anime cuyo título (o romaji) coincida con el detectado. */
export function findMatch(animes, title) {
  const t = norm(title);
  if (t.length < 3) return null;
  const names = (a) => [a.title, a.title_romaji].filter(Boolean).map(norm);
  return (
    animes.find((a) => names(a).includes(t)) ??
    animes.find((a) => names(a).some((n) => n.length >= 3 && (n.includes(t) || t.includes(n)))) ??
    null
  );
}

/** En JKAnime la URL dice el anime y el capítulo: /sousou-no-frieren/12/ */
export function detectFromJkUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)jkanime\./i.test(u.hostname)) return null;
    const [slug, ep] = u.pathname.split('/').filter(Boolean);
    if (!slug || ['buscar', 'directorio', 'horario', 'genero', 'letra', 'top'].includes(slug)) return null;
    return { slug, episode: /^\d+$/.test(ep ?? '') ? Number(ep) : null, title: slug.replace(/-/g, ' ') };
  } catch {
    return null;
  }
}

/** Anime de la lista cuyo slug de JKAnime (aprendido o derivado del romaji) coincide. */
export function findBySlug(animes, slug) {
  return animes.find((a) => [a.source_url, a.last_episode_url].some((u) => detectFromJkUrl(u ?? '')?.slug === slug))
    ?? animes.find((a) => slugify(a.title_romaji || a.title) === slug)
    ?? null;
}

export function slugify(title) {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Intenta adivinar la URL del siguiente capítulo incrementando el último número de la ruta. */
export function guessNextEpisodeUrl(url, watched) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const re = new RegExp(`(\\D|^)(0*${watched})(?!.*\\d)`);
    const path = u.pathname + u.search;
    if (!re.test(path)) return null;
    return u.origin + path.replace(re, (_m, pre, num) => pre + String(watched + 1).padStart(num.length, '0'));
  } catch {
    return null;
  }
}
