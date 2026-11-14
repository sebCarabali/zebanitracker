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

/** Busca en la lista un anime cuyo título coincida con el detectado. */
export function findMatch(animes, title) {
  const t = norm(title);
  if (t.length < 3) return null;
  return (
    animes.find((a) => norm(a.title) === t) ??
    animes.find((a) => {
      const n = norm(a.title);
      return n.length >= 3 && (n.includes(t) || t.includes(n));
    }) ??
    null
  );
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
