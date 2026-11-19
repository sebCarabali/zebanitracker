'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Anime, api, guessNextEpisodeUrl, knownEpisodes, relativeTime, STATUS_COLORS, STATUS_LABELS } from '@/lib/api';
import { Cover } from './Cover';
import { StarIcon } from './Icons';
import { WatchLinks } from './WatchLinks';
import { isJkUrl } from '@/lib/watch';

export function pctOf(a: Anime) {
  const total = knownEpisodes(a);
  return total ? Math.min(100, Math.round((a.watched_episodes / total) * 100)) : 0;
}

/** "12 / 28", "5 / 8 emitidos", "5 / ?" */
export function episodesLabel(a: Anime) {
  if (a.total_episodes) return `${a.watched_episodes}/${a.total_episodes}`;
  if (a.aired_episodes) return `${a.watched_episodes}/${a.aired_episodes} emitidos`;
  return `${a.watched_episodes}/?`;
}

export function nextEpisodeLabel(a: Anime) {
  if (!a.next_episode_at || a.airing_status !== 'RELEASING') return null;
  const n = (a.aired_episodes ?? 0) + 1;
  return `Cap. ${n} ${relativeTime(a.next_episode_at)}`;
}

function useRunner(onChange: (a: Anime) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<Anime>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function FavButton({ anime, onChange }: { anime: Anime; onChange: (a: Anime) => void }) {
  const { busy, run } = useRunner(onChange);
  return (
    <button
      className={`fav ${anime.is_favorite ? 'on' : ''}`}
      aria-label={anime.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      aria-pressed={anime.is_favorite}
      disabled={busy}
      onClick={(e) => { e.preventDefault(); run(() => api.toggleFavorite(anime.id)); }}
    >
      <StarIcon filled={anime.is_favorite} />
    </button>
  );
}

/** Tarjeta grande de "Continúa viendo". */
export function ContinueCard({ anime, onChange }: { anime: Anime; onChange: (a: Anime) => void }) {
  const { busy, error, run } = useRunner(onChange);
  const limit = knownEpisodes(anime);
  const done = limit !== null && anime.watched_episodes >= limit;
  const pct = pctOf(anime);
  const next = nextEpisodeLabel(anime);
  return (
    <article className="continue">
      <Link href={`/animes/${anime.id}`} aria-hidden="true" tabIndex={-1}>
        <Cover src={anime.cover_url} title={anime.title} />
      </Link>
      <div className="continue-body">
        <div>
          <h3><Link href={`/animes/${anime.id}`}>{anime.title}</Link></h3>
          <span className="muted small">{next ?? STATUS_LABELS[anime.status]}</span>
        </div>
        <div className="count">
          <strong>{anime.watched_episodes}</strong>
          <span className="muted small">/ {anime.total_episodes ?? anime.aired_episodes ?? '?'} caps.</span>
          {anime.total_episodes ? <span className="pct">{pct}%</span> : null}
        </div>
        <ProgressBar pct={pct} />
        <div className="continue-actions">
          <button className="btn icon" aria-label="Quitar un capítulo" disabled={busy || anime.watched_episodes === 0} onClick={() => run(() => api.prev(anime.id))}>−</button>
          <button className="btn primary" disabled={busy || done} onClick={() => run(() => api.next(anime.id))}>
            {done ? (anime.airing_status === 'RELEASING' ? 'Al día' : 'Terminado') : `Visto cap. ${anime.watched_episodes + 1}`}
          </button>
        </div>
        {!done && <WatchLinks anime={anime} episode={anime.watched_episodes + 1} />}
        <NextLinks anime={anime} />
        {error && <span className="error small">{error}</span>}
      </div>
    </article>
  );
}

/** "Abrir siguiente" (URL adivinada) o "Volver a donde lo dejaste" si se guardó la página del capítulo. */
export function NextLinks({ anime }: { anime: Anime }) {
  if (!anime.last_episode_url || isJkUrl(anime.last_episode_url)) return null; // JKAnime ya tiene su propio enlace
  const next = guessNextEpisodeUrl(anime.last_episode_url, anime.watched_episodes);
  return (
    <div className="next-links small">
      {next
        ? <a href={next} target="_blank" rel="noreferrer">Abrir cap. {anime.watched_episodes + 1} ↗</a>
        : <a href={anime.last_episode_url} target="_blank" rel="noreferrer">Volver a la página del cap. {anime.watched_episodes} ↗</a>}
    </div>
  );
}

/** Tarjeta de la biblioteca. */
export function AnimeCard({ anime, onChange }: { anime: Anime; onChange: (a: Anime) => void }) {
  const color = STATUS_COLORS[anime.status];
  const next = nextEpisodeLabel(anime);
  return (
    <article className="card">
      <div style={{ position: 'relative' }}>
        <Link href={`/animes/${anime.id}`} className="card-link" tabIndex={-1} aria-hidden="true">
          <Cover src={anime.cover_url} title={anime.title}>
            <span className="pill" style={{ '--c': color } as React.CSSProperties}><span className="dot" />{STATUS_LABELS[anime.status]}</span>
            {next && <span className="airing-pill">{next}</span>}
          {anime.score && <span className="score-pill" aria-label={`Tu puntuación: ${anime.score} de 10`}>★ {anime.score}</span>}
          </Cover>
        </Link>
        <FavButton anime={anime} onChange={onChange} />
      </div>
      <div className="card-body">
        <h3 title={anime.title}><Link href={`/animes/${anime.id}`} style={{ color: 'inherit' }}>{anime.title}</Link></h3>
        <div className="progress-row">
          <ProgressBar pct={pctOf(anime)} color={color} />
          <span>{episodesLabel(anime)}</span>
        </div>
      </div>
    </article>
  );
}
