'use client';

import { useState } from 'react';
import { api, Anime, Recap as RecapData } from '@/lib/api';

/** "¿En qué iba?": resumen con IA hasta el último capítulo visto, sin spoilers de lo que sigue. */
export function Recap({ anime }: { anime: Anime }) {
  const [data, setData] = useState<RecapData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [episode, setEpisode] = useState(anime.watched_episodes);
  const idleDays = anime.last_watched_at ? Math.floor((Date.now() - new Date(anime.last_watched_at).getTime()) / 86_400_000) : null;

  if (anime.watched_episodes < 1) return null;

  async function load(ep = episode) {
    setBusy(true);
    setError(null);
    try {
      setData(await api.recap(anime.id, ep));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel recap">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.35rem' }}>¿En qué iba?</h2>
          <span className="muted small">
            Resumen con IA hasta el cap. {episode}, sin spoilers de lo que sigue
            {idleDays !== null && idleDays > 14 ? ` · lo dejaste hace ${idleDays} días` : ''}
          </span>
        </div>
        <span className="ai-badge">✦ IA</span>
      </div>
      {!data && (
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => load()}>
            {busy ? 'Recordando…' : `Resumir hasta el cap. ${episode}`}
          </button>
          {anime.watched_episodes > 1 && (
            <label className="row muted small">o hasta el
              <input type="number" min={1} max={anime.watched_episodes} value={episode} style={{ width: 80 }}
                onChange={(e) => setEpisode(Math.max(1, Math.min(anime.watched_episodes, Number(e.target.value) || 1)))} />
            </label>
          )}
        </div>
      )}
      {busy && !data && <div className="skeleton" style={{ height: 90 }} />}
      {error && <p className="error small">{error}</p>}
      {data && (
        <div className="recap-body">
          {data.recap.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
          {data.key_points.length > 0 && (
            <>
              <h3 className="section-label">Para recordar</h3>
              <ul>{data.key_points.map((k) => <li key={k}>{k}</li>)}</ul>
            </>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            {data.confidence === 'low'
              ? '⚠ La IA no conoce bien esta obra: es un resumen general del planteamiento.'
              : 'Generado con IA a partir de lo que conoce de la obra; puede tener imprecisiones.'}
            {' '}<button className="link small" onClick={() => setData(null)}>Otro capítulo</button>
          </p>
        </div>
      )}
    </section>
  );
}
