/**
 * Caché de sinopsis traducidas en el navegador (localStorage), para no pedir de nuevo al servidor
 * al volver a un anime. Se invalida sola si cambia la sinopsis original o el idioma del perfil.
 */
const PREFIX = 'zt-tr:';
const MAX_ENTRIES = 300;
const TTL = 30 * 24 * 3600_000;

interface Entry { lang: string; text: string; sig: string; at: number }

/** Firma barata del texto original (longitud + hash djb2). */
export function signature(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

export function readTranslation(anilistId: number, original: string): { lang: string; text: string } | null {
  try {
    const raw = localStorage.getItem(PREFIX + anilistId);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (e.sig !== signature(original) || Date.now() - e.at > TTL) return null;
    return { lang: e.lang, text: e.text };
  } catch {
    return null;
  }
}

export function writeTranslation(anilistId: number, original: string, lang: string, text: string) {
  try {
    localStorage.setItem(PREFIX + anilistId, JSON.stringify({ lang, text, sig: signature(original), at: Date.now() } satisfies Entry));
    // Limita el tamaño: borra las más antiguas
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length > MAX_ENTRIES) {
      keys.map((k) => ({ k, at: (JSON.parse(localStorage.getItem(k) ?? '{}') as Entry).at ?? 0 }))
        .sort((a, b) => a.at - b.at).slice(0, keys.length - MAX_ENTRIES)
        .forEach(({ k }) => localStorage.removeItem(k));
    }
  } catch { /* sin espacio o modo privado: se ignora */ }
}

/** Al cambiar el idioma del perfil, las traducciones guardadas dejan de servir. */
export function clearTranslations() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* nada */ }
}
