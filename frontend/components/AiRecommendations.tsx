'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AiRecommendations as Recs, api, Anime, AnimeStatus, FORMAT_LABELS } from '@/lib/api';
import { Cover } from './Cover';

const IDEAS = ['Algo corto para el fin de semana', 'Misterio con buen final', 'Para reír', 'Una película', 'Algo emotivo'];

/**
 * Recomendaciones de IA a partir de tu historial, puntuaciones, abandonos y preferencias.
 * La IA solo elige entre títulos reales de AniList y explica por qué encajan contigo.
 */
export function AiRecommendations({ hasAnimes, onAdded }: { hasAnimes: boolean; onAdded: (a: Anime) => void }) {
  const [recs, setRecs] = useState<Recs | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [added, setAdded] = useState<Set<number>>(new Set());

  /** Normaliza la respuesta: sin lista válida se trata como "sin recomendaciones". */
  const normalize = (r: Partial<Recs> | null | undefined): Recs | null =>
    r && Array.isArray(r.items) ? (r as Recs) : null;

  async function generate(body: { request?: string; refresh?: boolean } = {}) {
    setGenerating(true);
    setError(null);
    try {
      const r = await api.generateAiRecommendations(body);
      setRecs(normalize(r) ?? { summary: '', request: null, items: [], generated_at: '', lang: 'es', note: (r as Recs | null)?.note });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!hasAnimes) { setLoading(false); return; }
    let cancelled = false;
    api.aiRecommendations()
      .then((raw) => {
        if (cancelled) return;
        const r = normalize(raw);
        setRecs(r?.items.length ? r : null);
        // Primera vez o recomendaciones viejas: se generan solas
        if (!r?.items.length || r.stale) generate({ refresh: !!r?.items.length });
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnimes]);

  async function add(media: Recs['items'][number]['media'], status: AnimeStatus) {
    try {
      const created = await api.create({
        title: media.title, total_episodes: media.total_episodes, cover_url: media.cover_url, source_url: media.site_url,
        anilist_id: media.anilist_id, status, watched_episodes: 0,
      });
      setAdded((s) => new Set(s).add(media.anilist_id));
      onAdded(created);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!hasAnimes) return null;

  return (
    <section className="ai-section" aria-labelledby="ai-title" aria-busy={generating}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id="ai-title">✦ Recomendado por IA</h2>
          <span className="muted small">Según lo que ves, cómo puntúas, lo que abandonas y tus preferencias de Ajustes.</span>
        </div>
        <button className="btn glass" disabled={generating} onClick={() => { setAsk(''); generate({ refresh: true }); }}>
          {generating ? 'Pensando…' : 'Otras recomendaciones'}
        </button>
      </div>

      <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) generate({ request: ask.trim() }); }}>
        <label className="sr-only" htmlFor="ai-ask">¿Qué te apetece ver?</label>
        <input id="ai-ask" maxLength={300} placeholder="¿Qué te apetece? p. ej. algo corto de misterio con buen final" value={ask} onChange={(e) => setAsk(e.target.value)} />
        <button className="btn primary" disabled={generating || !ask.trim()}>Pedir</button>
      </form>
      <div className="ai-chips">
        {IDEAS.map((i) => <button key={i} type="button" disabled={generating} onClick={() => { setAsk(i); generate({ request: i }); }}>{i}</button>)}
      </div>

      {error && <p className="banner" style={{ background: 'var(--accent-strong)' }}>{error}</p>}
      {(loading || (generating && !recs?.items?.length)) ? (
        <div className="ai-grid" aria-label="Generando recomendaciones">
          {[0, 1, 2, 3].map((i) => <div key={i} className="ai-card"><div className="skeleton" style={{ flex: 1 }}><i /><i /><i style={{ width: '60%' }} /></div></div>)}
        </div>
      ) : recs?.items?.length ? (
        <>
          {recs.summary && <p className="ai-summary">{recs.request ? `“${recs.request}”: ` : ''}{recs.summary}</p>}
          <div className="ai-grid" style={{ opacity: generating ? 0.5 : 1 }}>
            {recs.items.map(({ media, reason }) => (
              <article key={media.anilist_id} className="ai-card">
                <Link href={`/explore/${media.anilist_id}`} tabIndex={-1} aria-hidden="true"><Cover src={media.cover_url} title={media.title} /></Link>
                <div className="ai-card-body">
                  <h3><Link href={`/explore/${media.anilist_id}`}>{media.title}</Link></h3>
                  <span className="muted small">
                    {[media.format && (FORMAT_LABELS[media.format] ?? media.format), media.year,
                      media.total_episodes ? `${media.total_episodes} caps.` : null, media.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                  <p>{reason}</p>
                  {added.has(media.anilist_id) ? <span className="small" style={{ fontWeight: 600 }}>✓ Agregado a tu lista</span> : (
                    <div className="row">
                      <button className="btn primary" onClick={() => add(media, 'watching')}>Empezar a ver</button>
                      <button className="btn" onClick={() => add(media, 'plan_to_watch')}>+ Pendiente</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>{recs?.note ?? 'Pulsa “Otras recomendaciones” o pide algo concreto.'}</p>
      )}
    </section>
  );
}
