'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, Anime, STATUS_LABELS } from '@/lib/api';

export function ProgressBar({ watched, total }: { watched: number; total: number | null }) {
  const pct = total ? Math.round((watched / total) * 100) : 0;
  return (
    <div className="progress" title={total ? `${pct}%` : 'Total desconocido'}>
      <div className="progress-fill" style={{ width: total ? `${pct}%` : '0%' }} />
      <span className="progress-label">
        {watched} / {total ?? '?'} {total ? `· ${pct}%` : ''}
      </span>
    </div>
  );
}

export function AnimeCard({ anime, onChange, onDelete }: {
  anime: Anime;
  onChange: (a: Anime) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<Anime | void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res) onChange(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const done = anime.total_episodes !== null && anime.watched_episodes >= anime.total_episodes;

  return (
    <article className="card">
      <div className="cover">
        {anime.cover_url ? <img src={anime.cover_url} alt="" /> : <span>{anime.title.slice(0, 1)}</span>}
        <button
          className={`fav ${anime.is_favorite ? 'on' : ''}`}
          aria-label={anime.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          disabled={busy}
          onClick={() => run(() => api.toggleFavorite(anime.id))}
        >
          {anime.is_favorite ? '★' : '☆'}
        </button>
      </div>
      <div className="card-body">
        <h3 title={anime.title}>{anime.title}</h3>
        <span className={`badge ${anime.status}`}>{STATUS_LABELS[anime.status]}</span>
        <ProgressBar watched={anime.watched_episodes} total={anime.total_episodes} />
        <div className="row">
          <button className="btn" disabled={busy || anime.watched_episodes === 0} onClick={() => run(() => api.prev(anime.id))}>
            −1
          </button>
          <button className="btn primary grow" disabled={busy || done} onClick={() => run(() => api.next(anime.id))}>
            {done ? 'Terminado' : `Visto cap. ${anime.watched_episodes + 1}`}
          </button>
        </div>
        <div className="row small">
          <Link href={`/animes/${anime.id}`}>Editar</Link>
          {anime.source_url && <a href={anime.source_url} target="_blank" rel="noreferrer">Ver ↗</a>}
          <button
            className="link danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`¿Eliminar "${anime.title}"?`)) run(async () => { await api.remove(anime.id); onDelete(anime.id); });
            }}
          >
            Eliminar
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
      </div>
    </article>
  );
}
