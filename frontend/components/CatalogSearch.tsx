'use client';

import { useEffect, useRef, useState } from 'react';
import { api, CatalogAnime, FORMAT_LABELS } from '@/lib/api';

/** Buscador con autocompletado contra el catálogo de AniList. */
export function CatalogSearch({ onSelect }: { onSelect: (a: CatalogAnime) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogAnime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.searchCatalog(term);
        if (!cancelled) { setResults(r); setOpen(true); }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400); // debounce: respeta el límite de AniList
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="catalog" ref={boxRef}>
      <label>Buscar en AniList
        <input
          placeholder="Escribe el nombre del anime…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        />
      </label>
      {loading && <span className="muted small">Buscando…</span>}
      {error && <span className="error small">{error}</span>}
      {open && results.length > 0 && (
        <ul className="catalog-results">
          {results.map((a) => (
            <li key={a.anilist_id}>
              <button type="button" onClick={() => { onSelect(a); setOpen(false); setQ(''); }}>
                {a.cover_url ? <img src={a.cover_url} alt="" /> : <span className="ph" />}
                <span className="info">
                  <strong>{a.title}</strong>
                  {a.title_romaji && a.title_romaji !== a.title && <span className="muted small">{a.title_romaji}</span>}
                  <span className="muted small">
                    {[a.format && (FORMAT_LABELS[a.format] ?? a.format), a.year, a.total_episodes ? `${a.total_episodes} caps.` : 'caps. ?']
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && q.trim().length >= 2 && results.length === 0 && !error && (
        <p className="muted small">Sin resultados en AniList; puedes llenarlo a mano.</p>
      )}
    </div>
  );
}
