'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AIRING_LABELS, api, Anime, AnimeStatus, Franchise, STATUS_COLORS, STATUS_LABELS } from '@/lib/api';
import { Cover } from './Cover';

/**
 * Temporadas, películas y OVAs de la franquicia (precuelas/secuelas de AniList) con tu estado en cada una.
 * `currentAnilistId` resalta la entrega que estás viendo.
 */
export function SeasonsPanel({ currentAnilistId, onListChange }: {
  currentAnilistId: number;
  onListChange?: (added: Anime[]) => void;
}) {
  const router = useRouter();
  const [franchise, setFranchise] = useState<Franchise | null>(null);
  const [mine, setMine] = useState<Map<number, Anime>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.catalogSeasons(currentAnilistId), api.list()])
      .then(([f, list]) => {
        if (cancelled) return;
        setFranchise(f);
        setMine(new Map(list.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a])));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [currentAnilistId]);

  const entries = franchise?.entries ?? [];
  const seasons = entries.filter((e) => e.season_number);
  const extras = entries.filter((e) => !e.season_number);
  const visible = showExtras ? entries : seasons.length ? seasons : entries;
  const missing = useMemo(
    () => (showExtras ? entries : seasons).filter((e) => !mine.has(e.media.anilist_id)),
    [entries, seasons, mine, showExtras],
  );

  // Siguiente temporada tras la actual, si ya la terminaste y aún no la agregas
  const current = entries.find((e) => e.media.anilist_id === currentAnilistId);
  const currentMine = mine.get(currentAnilistId);
  const nextSeason = current?.season_number
    ? seasons.find((e) => e.season_number === current.season_number! + 1)
    : undefined;
  const suggestNext = nextSeason && !mine.has(nextSeason.media.anilist_id) && currentMine?.status === 'completed';

  async function add(items: { anilist_id: number; status: AnimeStatus }[], goTo?: boolean) {
    setBusy(true);
    setError(null);
    try {
      const added = await api.addMany(items);
      setMine((m) => { const n = new Map(m); for (const a of added) n.set(a.anilist_id!, a); return n; });
      onListChange?.(added);
      if (goTo && added[0]) router.push(`/animes/${added[0].id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !franchise) return null;
  if (!franchise) return <section className="panel"><p className="muted small" style={{ margin: 0 }}>Buscando temporadas…</p></section>;
  if (entries.length <= 1) return null; // anime sin otras temporadas

  return (
    <section className="panel seasons" aria-labelledby="seasons-title">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 id="seasons-title" style={{ fontSize: '1.35rem' }}>Temporadas</h2>
          <span className="muted small">
            {seasons.length} {seasons.length === 1 ? 'temporada' : 'temporadas'}
            {extras.length > 0 && ` · ${extras.length} ${extras.length === 1 ? 'película/extra' : 'películas y extras'}`}
          </span>
        </div>
        <div className="row">
          {extras.length > 0 && seasons.length > 0 && (
            <button className="btn ghost" onClick={() => setShowExtras((v) => !v)}>{showExtras ? 'Solo temporadas' : 'Ver películas y extras'}</button>
          )}
          {missing.length > 0 && (
            <button className="btn navy" disabled={busy}
              onClick={() => add(missing.map((e) => ({ anilist_id: e.media.anilist_id, status: 'plan_to_watch' })))}>
              Agregar {missing.length === 1 ? 'la que falta' : `las ${missing.length} que faltan`}
            </button>
          )}
        </div>
      </div>

      {suggestNext && nextSeason && (
        <div className="banner">
          <span className="grow">Terminaste esta temporada. ¿Seguimos con <strong>{nextSeason.label}</strong>?</span>
          <button className="btn primary" disabled={busy} onClick={() => add([{ anilist_id: nextSeason.media.anilist_id, status: 'watching' }], true)}>
            Empezar {nextSeason.label}
          </button>
        </div>
      )}

      <ol className="season-list">
        {visible.map((e) => {
          const a = mine.get(e.media.anilist_id);
          const isCurrent = e.media.anilist_id === currentAnilistId;
          const eps = e.media.total_episodes ?? e.media.aired_episodes;
          return (
            <li key={e.media.anilist_id} className={isCurrent ? 'current' : ''} aria-current={isCurrent ? 'true' : undefined}>
              <Link href={a ? `/animes/${a.id}` : `/explore/${e.media.anilist_id}`} className="season-cover" tabIndex={-1} aria-hidden="true">
                <Cover src={e.media.cover_url} title={e.media.title} />
              </Link>
              <div className="season-info">
                <span className="season-label">{e.label}{isCurrent ? ' · estás aquí' : ''}</span>
                <Link href={a ? `/animes/${a.id}` : `/explore/${e.media.anilist_id}`} className="season-title">{e.media.title}</Link>
                <span className="muted small">
                  {[e.start?.slice(0, 4), e.media.format !== 'MOVIE' && eps ? `${eps} caps.${e.media.total_episodes ? '' : ' emitidos'}` : null,
                    e.media.airing_status && e.media.airing_status !== 'FINISHED' ? AIRING_LABELS[e.media.airing_status] : null]
                    .filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="season-state">
                {a ? (
                  <Link href={`/animes/${a.id}`} className="pill-inline" style={{ '--c': STATUS_COLORS[a.status] } as React.CSSProperties}>
                    <span className="dot" />{STATUS_LABELS[a.status]} · {a.watched_episodes}/{a.total_episodes ?? '?'}
                  </Link>
                ) : (
                  <div className="row">
                    <button className="btn" disabled={busy} onClick={() => add([{ anilist_id: e.media.anilist_id, status: 'plan_to_watch' }])}>+ Pendiente</button>
                    <button className="btn" disabled={busy} title="Ya la viste"
                      onClick={() => add([{ anilist_id: e.media.anilist_id, status: 'completed' }])}>✓ Vista</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="error small" style={{ margin: 0 }}>{error}</p>}
    </section>
  );
}
