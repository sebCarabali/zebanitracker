'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AIRING_LABELS, api, Anime, AnimeDetails, AnimeStatus, FORMAT_LABELS, relativeTime, SEASON_LABELS, SOURCE_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { BackIcon, PlayIcon, RefreshIcon, StarIcon } from '@/components/Icons';

const RING_R = 56;
const RING_C = 2 * Math.PI * RING_R;

export default function AnimeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ title: '', total: '', source: '', notes: '' });
  const [details, setDetails] = useState<AnimeDetails | null>(null);
  const [showFull, setShowFull] = useState(false);

  // Ficha de AniList (sinopsis, estudio…) para los animes vinculados
  useEffect(() => {
    if (!anime?.anilist_id) { setDetails(null); return; }
    api.catalogDetails(anime.anilist_id).then(setDetails).catch(() => setDetails(null));
  }, [anime?.anilist_id]);

  useEffect(() => {
    if (!session) return;
    api.get(id).then(load).catch((e) => setError(e.message));
  }, [id, session]);

  function load(a: Anime) {
    setAnime(a);
    setForm({ title: a.title, total: a.total_episodes?.toString() ?? '', source: a.source_url ?? '', notes: a.notes ?? '' });
  }

  async function run(fn: () => Promise<Anime>, optimistic?: Partial<Anime>) {
    if (!anime) return;
    const before = anime;
    if (optimistic) setAnime({ ...anime, ...optimistic });
    setBusy(true);
    setError(null);
    try {
      const updated = await fn();
      setAnime(updated);
      return updated;
    } catch (e) {
      setAnime(before);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !anime) return <main className="container"><p className="error">{error}</p></main>;
  if (!anime) return <main className="container"><p className="muted">Cargando…</p></main>;

  const total = anime.total_episodes;
  const aired = anime.aired_episodes;
  // Cuántos botones mostrar: total; si no, emitidos; si no, lo visto + 12
  const gridSize = total ?? (aired !== null ? Math.max(aired, anime.watched_episodes) + 3 : anime.watched_episodes + 12);
  const known = total ?? aired;
  const pct = known ? Math.min(100, Math.round((anime.watched_episodes / known) * 100)) : null;
  const dash = `${(((pct ?? 0) / 100) * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`;
  const limit = total ?? aired;
  const done = limit !== null && anime.watched_episodes >= limit;
  const nextAt = anime.airing_status === 'RELEASING' && anime.next_episode_at ? anime.next_episode_at : null;

  const setEpisode = (n: number) => {
    const target = n === anime.watched_episodes ? n - 1 : n;
    run(() => api.setProgress(anime.id, target), { watched_episodes: target });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const updated = await run(() => api.update(anime!.id, {
      title: form.title.trim(),
      total_episodes: form.total === '' ? null : Number(form.total),
      source_url: form.source.trim() || null,
      notes: form.notes.trim() || null,
    }));
    if (updated) { load(updated); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${anime!.title}" de tu lista?`)) return;
    try {
      await api.remove(anime!.id);
      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tags = [
    total ? `${total} caps.` : aired ? `${aired} caps. emitidos` : 'Capítulos desconocidos',
    anime.airing_status ? AIRING_LABELS[anime.airing_status] : null,
    nextAt ? `Cap. ${(aired ?? 0) + 1} ${relativeTime(nextAt)}` : null,
  ].filter(Boolean) as string[];

  return (
    <main>
      <section className="hero">
        {anime.cover_url && <div className="hero-bg" style={{ backgroundImage: `url(${anime.cover_url})` }} />}
        <div className="hero-inner">
          <Link href="/" className="back"><BackIcon /> Volver a mi lista</Link>
          <div className="hero-main">
            <Cover src={anime.cover_url} title={anime.title} />
            <div className="hero-text">
              <div className="tags">{tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              <h1>{anime.title}</h1>
              <p className="hero-sub">
                {anime.anilist_id ? 'Vinculado a AniList' : 'Agregado a mano'}
                {anime.last_watched_at && ` · Último capítulo marcado ${relativeTime(anime.last_watched_at)}`}
              </p>
              <div className="row" style={{ gap: 10, marginTop: 6 }}>
                <button className="btn primary lg" disabled={busy || done}
                  onClick={() => run(() => api.next(anime.id), { watched_episodes: anime.watched_episodes + 1 })}>
                  <PlayIcon /> {done ? (anime.airing_status === 'RELEASING' ? 'Estás al día' : 'Terminado') : `Visto cap. ${anime.watched_episodes + 1}`}
                </button>
                <button className={`btn lg glass`} aria-pressed={anime.is_favorite} disabled={busy}
                  style={{ color: anime.is_favorite ? 'var(--fav)' : undefined }}
                  onClick={() => run(() => api.toggleFavorite(anime.id), { is_favorite: !anime.is_favorite })}>
                  <StarIcon filled={anime.is_favorite} size={18} />
                  <span style={{ color: 'var(--cream)' }}>{anime.is_favorite ? 'Favorito' : 'Agregar a favoritos'}</span>
                </button>
                {anime.source_url && (
                  <a href={anime.source_url} target="_blank" rel="noreferrer" className="btn lg glass">Ver ↗</a>
                )}
                {anime.anilist_id && (
                  <button className="btn lg glass" disabled={busy} onClick={() => run(() => api.syncOne(anime.id)).then((a) => a && load(a))}
                    title="Actualizar capítulos y emisión desde AniList">
                    <RefreshIcon /> Actualizar
                  </button>
                )}
              </div>
            </div>

            <div className="ring-box">
              <div className="ring">
                <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={pct !== null ? `Progreso ${pct}%` : 'Progreso'}>
                  <circle cx="66" cy="66" r={RING_R} fill="none" stroke="rgba(249, 245, 235, .18)" strokeWidth="12" />
                  <circle cx="66" cy="66" r={RING_R} fill="none" stroke="var(--red)" strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={dash} transform="rotate(-90 66 66)" />
                </svg>
                <div className="ring-label">
                  <strong>{pct !== null ? `${pct}%` : anime.watched_episodes}</strong>
                  <span>{anime.watched_episodes} de {total ?? (aired ? `${aired} emitidos` : '?')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="detail">
        <div className="detail-main">
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div>
              <h2 style={{ fontSize: '1.35rem' }}>Capítulos</h2>
              <span className="muted small">Toca un capítulo para marcar hasta ahí. Tócalo otra vez para desmarcarlo.</span>
            </div>
            <span className="muted small">{anime.watched_episodes ? `Último visto: cap. ${anime.watched_episodes}` : 'Aún no empiezas'}</span>
          </div>
          <div className="episodes">
            {Array.from({ length: gridSize }, (_, i) => {
              const n = i + 1;
              const seen = n <= anime.watched_episodes;
              const next = n === anime.watched_episodes + 1;
              const future = !seen && aired !== null && n > aired && anime.airing_status === 'RELEASING';
              return (
                <button key={n} className={`ep ${seen ? 'seen' : ''} ${next ? 'next' : ''} ${future ? 'future' : ''}`}
                  aria-pressed={seen} aria-label={`Capítulo ${n}${seen ? ', visto' : ''}${future ? ', aún no emitido' : ''}`}
                  disabled={busy} onClick={() => setEpisode(n)}>
                  {n}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--accent-strong)' }} />Visto</span>
            <span><i style={{ border: '2px solid var(--accent-strong)' }} />Siguiente</span>
            <span><i style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)' }} />Pendiente</span>
            {anime.airing_status === 'RELEASING' && <span><i style={{ border: '1px dashed var(--border-2)', opacity: .6 }} />Aún no emitido</span>}
          </div>
          {!total && <p className="muted small" style={{ margin: 0 }}>
            {anime.anilist_id ? 'AniList aún no publica el total; se actualizará solo.' : 'Escribe el total en “Editar” o vincúlalo a AniList para completarlo solo.'}
          </p>}
          {error && <p className="error small">{error}</p>}
        </section>

        {details?.description && (
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2 style={{ fontSize: '1.35rem' }}>Sinopsis</h2>
              <Link href={`/explore/${details.anilist_id}`} className="small">Ver ficha completa →</Link>
            </div>
            <p className="synopsis">
              {showFull || details.description.length <= 420 ? details.description : `${details.description.slice(0, 420).trim()}…`}
            </p>
            {details.description.length > 420 && (
              <button className="link" onClick={() => setShowFull((v) => !v)}>{showFull ? 'Ver menos' : 'Leer más'}</button>
            )}
            <dl className="info-list" style={{ marginTop: 4 }}>
              {([
                ['Formato', details.format ? FORMAT_LABELS[details.format] ?? details.format : null],
                ['Temporada', details.season && details.year ? `${SEASON_LABELS[details.season]} ${details.year}` : null],
                ['Duración', details.duration ? `${details.duration} min por capítulo` : null],
                ['Estudio', details.studios.join(', ') || null],
                ['Origen', details.source ? SOURCE_LABELS[details.source] ?? details.source : null],
              ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
        )}
        </div>

        <aside className="detail-side">
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="section-label">Estado</h2>
            <div className="statuses" role="radiogroup" aria-label="Estado">
              {(Object.keys(STATUS_LABELS) as AnimeStatus[]).map((s) => (
                <button key={s} role="radio" aria-checked={anime.status === s} disabled={busy}
                  style={{ '--c': STATUS_COLORS[s] } as React.CSSProperties}
                  onClick={() => run(() => api.update(anime.id, { status: s }), { status: s })}>
                  <span className="dot" />{STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <form className="panel form" onSubmit={save}>
            <h2 className="section-label">Editar</h2>
            <label>Título
              <input required maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label>Total de capítulos
              <input type="number" min={anime.watched_episodes} placeholder="Desconocido" value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </label>
            <label>Dónde lo veo
              <input type="url" placeholder="https://…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </label>
            <label>Notas
              <textarea rows={4} maxLength={5000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="row">
              <button className="btn primary grow" disabled={busy}>{saved ? '✓ Guardado' : 'Guardar cambios'}</button>
              <button type="button" className="btn ghost" style={{ color: 'var(--dropped)' }} onClick={remove}>Eliminar</button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
