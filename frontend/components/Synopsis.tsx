'use client';

import { useEffect, useState } from 'react';
import { api, LANGUAGES } from '@/lib/api';

/**
 * Sinopsis traducida con IA al idioma del usuario (por defecto español), con opción de ver el original.
 * Si la IA no está disponible, muestra el original en inglés.
 */
export function Synopsis({ anilistId, original, clamp = 0 }: { anilistId: number; original: string; clamp?: number }) {
  const [text, setText] = useState<string | null>(null);
  const [lang, setLang] = useState<string | null>(null);
  const [translated, setTranslated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api.aiDescription(anilistId)
      .then((r) => { if (!cancelled) { setText(r.text); setLang(r.lang); setTranslated(r.translated); } })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [anilistId]);

  const shown = showOriginal || failed || !text ? original : text;
  const long = clamp > 0 && shown.length > clamp;

  return (
    <div className="synopsis-box">
      {loading ? (
        <div className="skeleton" aria-label="Traduciendo sinopsis…">
          <i /><i /><i style={{ width: '70%' }} />
          <span className="muted small">Traduciendo con IA…</span>
        </div>
      ) : (
        <p className="synopsis" lang={showOriginal || failed || !translated ? 'en' : lang ?? undefined}>
          {long && !expanded ? `${shown.slice(0, clamp).trim()}…` : shown}
        </p>
      )}
      <div className="row small synopsis-meta">
        {long && !loading && <button className="link" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Ver menos' : 'Leer más'}</button>}
        {!loading && translated && (
          <>
            <span className="ai-badge">✦ Traducido con IA{lang ? ` al ${LANGUAGES[lang]?.toLowerCase() ?? lang}` : ''}</span>
            <button className="link" onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? 'Ver traducción' : 'Ver original (inglés)'}</button>
          </>
        )}
        {!loading && failed && <span className="muted">Sinopsis original en inglés (la traducción no está disponible ahora).</span>}
      </div>
    </div>
  );
}
