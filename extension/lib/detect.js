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
  return animes.find((a) => [a.source_url, a.last_episode_url].some((u) => (detectFromJkUrl(u ?? '') ?? detectFromUrl(u ?? ''))?.slug === slug))
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

/**
 * Reconoce el anime y el capítulo según la URL de sitios conocidos:
 * - JKAnime: /sousou-no-frieren/12/
 * - AnimeFLV / TioAnime / AnimeYT: /ver/sousou-no-frieren-12
 * - MonosChinos: /ver/sousou-no-frieren-episodio-12
 * - AnimeAV1 / Latanime: /media/sousou-no-frieren/12 · /ver/sousou-no-frieren-episodio-12
 * - HiAnime / AniWatch / 9anime: /watch/sousou-no-frieren-18542?ep=… (capítulo por el título)
 * - Crunchyroll: /watch/GXXXX/titulo-del-capitulo (anime y capítulo por el título de la pestaña)
 */
export function detectFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const titleOf = (slug) => slug.replace(/-/g, ' ').trim();

  const jk = detectFromJkUrl(url);
  if (jk) return { ...jk, site: 'jkanime' };

  if (parts[0] === 'ver' && parts[1]) {
    const m = parts[1].match(/^(.+?)-(?:episodio-|capitulo-|ep-)?(\d{1,4})$/i);
    if (m) return { slug: m[1], episode: Number(m[2]), title: titleOf(m[1]), site: host };
  }
  if ((parts[0] === 'media' || parts[0] === 'anime') && parts[1] && /^\d{1,4}$/.test(parts[2] ?? '')) {
    return { slug: parts[1], episode: Number(parts[2]), title: titleOf(parts[1]), site: host };
  }
  if (parts[0] === 'watch' && parts[1] && !/crunchyroll/.test(host)) {
    const slug = parts[1].replace(/-\d{3,}$/, ''); // quita el id numérico final
    const ep = u.searchParams.get('episode') ?? u.searchParams.get('ep_num');
    return { slug, episode: ep && /^\d+$/.test(ep) ? Number(ep) : null, title: titleOf(slug), site: host };
  }
  return null;
}

/** Combina título de la pestaña y URL: la URL manda en el número de capítulo cuando lo trae. */
export function detectPage(url = '', tabTitle = '') {
  const fromTitle = detectFromTab(tabTitle);
  const fromUrl = detectFromUrl(url);
  return {
    title: fromTitle.title || fromUrl?.title || '',
    altTitle: fromUrl?.title ?? null,
    slug: fromUrl?.slug ?? null,
    site: fromUrl?.site ?? null,
    episode: fromUrl?.episode ?? fromTitle.episode ?? null,
    jk: fromUrl?.site === 'jkanime' ? fromUrl : null,
  };
}

/** Anime de tu lista que corresponde a la página (slug aprendido → título de la pestaña → título de la URL). */
export function matchPage(animes, d) {
  return (d.slug && findBySlug(animes, d.slug))
    || findMatch(animes, d.title)
    || (d.altTitle && findMatch(animes, d.altTitle))
    || null;
}
