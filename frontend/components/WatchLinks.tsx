'use client';

import { useEffect, useState } from 'react';
import { jkEpisodeUrl, jkSearchUrl, jkSlug, WatchTarget } from '@/lib/watch';

/**
 * Accesos a JKAnime: abrir un capítulo concreto o buscar el anime.
 * Se renderiza solo en el cliente porque el dominio configurado vive en localStorage.
 */
export function WatchLinks({ anime, episode, variant = 'compact', max }: {
  anime: WatchTarget;
  /** Capítulo a abrir por defecto (normalmente el siguiente por ver). */
  episode: number;
  variant?: 'compact' | 'hero' | 'full';
  /** Último capítulo disponible, para limitar el selector. */
  max?: number | null;
}) {
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState(String(episode));
  useEffect(() => setReady(true), []);
  useEffect(() => setPick(String(episode)), [episode]);
  if (!ready) return null;

  const { known } = jkSlug(anime);
  const search = jkSearchUrl(anime);
  const epUrl = jkEpisodeUrl(anime, episode);

  if (variant === 'compact') {
    return (
      <div className="watch-links small">
        <a href={epUrl} target="_blank" rel="noreferrer" title={known ? undefined : 'Enlace adivinado; si no abre, usa Buscar'}>
          Ver cap. {episode} en JKAnime ↗
        </a>
        <a href={search} target="_blank" rel="noreferrer" className="muted">Buscar</a>
      </div>
    );
  }

  const n = Number(pick);
  const valid = Number.isInteger(n) && n >= 1 && (!max || n <= max);

  return (
    <div className={`watch-box ${variant === 'hero' ? 'on-dark' : 'on-light'}`}>
      <div className="row" style={{ gap: 10 }}>
        <a href={epUrl} target="_blank" rel="noreferrer" className={`btn ${variant === 'hero' ? 'glass' : 'navy'} lg`}>
          Ver cap. {episode} en JKAnime ↗
        </a>
        <a href={search} target="_blank" rel="noreferrer" className={`btn ${variant === 'hero' ? 'glass' : ''} lg`}>Buscar en JKAnime ↗</a>
      </div>
      <form className="row watch-pick" onSubmit={(e) => {
        e.preventDefault();
        if (valid) window.open(jkEpisodeUrl(anime, n), '_blank', 'noopener');
      }}>
        <label className="row" style={{ gap: 8 }}>
          <span>Ir al capítulo</span>
          <input type="number" min={1} max={max ?? undefined} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Número de capítulo" />
        </label>
        <button className="btn" disabled={!valid}>Abrir ↗</button>
      </form>
      {!known && (
        <p className="watch-hint">
          El enlace al capítulo se arma con el título en romaji. Si no abre el anime correcto, usa “Buscar” y pega la
          página del anime en <em>Dónde lo veo</em>: desde ahí los enlaces serán exactos.
        </p>
      )}
    </div>
  );
}
