'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, CatalogAnime, FORMAT_LABELS, MediaType, NaturalSearchResult } from '@/lib/api';
import { Cover } from './Cover';
import { CheckIcon } from './Icons';

const EXAMPLES = [
  'algo como Frieren pero más corto y con romance',
  'un thriller psicológico de menos de 13 capítulos',
  'comedia relajada para ver con mi hermana',
  'manga de misterio terminado y con buena nota',
];

/** Búsqueda en lenguaje natural: la IA traduce la frase a filtros de AniList y ordena los resultados reales. */
export function NaturalSearch({ media, mine, onAdd, adding }: {
  media: MediaType;
  mine: Map<number, { id: string; status: string }>;
  onAdd: (a: CatalogAnime, status: 'watching' | 'plan_to_watch') => void;
  adding: number | null;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NaturalSearchResult | null>(null);

  async function run(text = q) {
    const query = text.trim();
    if (query.length < 3) return;
    setQ(query);
    setBusy(true);
    setError(null);
    try {
      setResult(await api.naturalSearch(query, media));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-search">
      <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <span className="ai-badge">✦ IA</span>
        <input aria-label="Describe lo que quieres ver" maxLength={300} placeholder="Describe lo que te apetece: “algo como Frieren pero más corto y con romance”"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" disabled={busy || q.trim().length < 3}>{busy ? 'Pensando…' : 'Buscar'}</button>
      </form>
      {!result && !busy && (
        <div className="chips">
          {EXAMPLES.map((ex) => <button key={ex} type="button" className="chip" onClick={() => run(ex)}>{ex}</button>)}
        </div>
      )}
      {error && <p className="error small">{error}</p>}
      {busy && <div className="ai-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>}
      {result && !busy && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p className="muted small" style={{ margin: 0 }}>
              {result.interpretation ?? 'Resultados'}
              {result.filters.similar_to?.length ? ` · referencia: ${result.filters.similar_to.join(', ')}` : ''}
            </p>
            <button className="link small" onClick={() => { setResult(null); setQ(''); }}>Limpiar</button>
          </div>
          {!result.items.length && <div className="empty">No encontramos nada que encaje. Prueba describiéndolo de otra forma.</div>}
          <div className="ai-grid">
            {result.items.map(({ media: m, reason, in_list }) => {
              const local = in_list ?? mine.get(m.anilist_id)?.id;
              return (
                <article key={m.anilist_id} className="ai-card">
                  <Cover src={m.cover_url} title={m.title}>
                    <Link href={`/explore/${m.anilist_id}`} className="cover-link" aria-label={`Ver ficha de ${m.title}`} />
                  </Cover>
                  <div className="ai-card-body">
                    <h3><Link href={`/explore/${m.anilist_id}`}>{m.title}</Link></h3>
                    <span className="muted small">
                      {[m.format && (FORMAT_LABELS[m.format] ?? m.format), m.year, (m.total_episodes ?? m.aired_episodes) ? `${m.total_episodes ?? m.aired_episodes} caps.` : null, m.score ? `${m.score}%` : null].filter(Boolean).join(' · ')}
                    </span>
                    {reason && <p className="small" style={{ margin: 0 }}>{reason}</p>}
                    <div className="row">
                      {local ? (
                        <Link href={`/animes/${local}`} className="btn small"><CheckIcon /> En tu lista</Link>
                      ) : (
                        <>
                          <button className="btn primary small" disabled={adding === m.anilist_id} onClick={() => onAdd(m, 'watching')}>Empezar</button>
                          <button className="btn small" disabled={adding === m.anilist_id} onClick={() => onAdd(m, 'plan_to_watch')}>+ Pendiente</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
