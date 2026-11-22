'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Anime, FORMAT_LABELS, MINUTES_PER_EPISODE, STATUS_COLORS, STATUS_LABELS, WatchEvent, AnimeStatus } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { dayKey, perDay, streaks } from '@/lib/activity';
import { MonthlySummary } from '@/components/MonthlySummary';
import { ShareCard } from '@/components/ShareCard';
import { SafeBoundary } from '@/components/SafeBoundary';

function Bars({ rows, unit }: { rows: { label: string; value: number; color?: string }[]; unit: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted small" style={{ margin: 0 }}>Aún no hay datos.</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span title={r.label}>{r.label}</span>
          <div className="track"><div style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span>{unit(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

const hours = (eps: number) => Math.round((eps * MINUTES_PER_EPISODE) / 60);

export default function StatsPage() {
  const { session } = useAuth();
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [rewatches, setRewatches] = useState(0);
  const [initialMonth, setInitialMonth] = useState<string | undefined>();

  useEffect(() => { try { setInitialMonth(new URLSearchParams(window.location.search).get('month') ?? undefined); } catch {} }, []);

  useEffect(() => {
    if (!session) return;
    api.profile().then((p) => setUsername(p.username)).catch(() => {});
    api.rewatches().then((r) => setRewatches(Array.isArray(r) ? r.length : 0)).catch(() => {});
    Promise.all([api.list(), api.activity(365)])
      .then(([a, e]) => { setAnimes(a); setEvents(e); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  const s = useMemo(() => {
    const animeOnly = animes.filter((a) => (a.media_type ?? 'anime') === 'anime');
    const episodes = animeOnly.reduce((n, a) => n + a.watched_episodes, 0);
    const minutes = animeOnly.reduce((n, a) => n + a.watched_episodes * (a.duration ?? MINUTES_PER_EPISODE), 0);
    const bookChapters = animes.filter((a) => a.media_type && a.media_type !== 'anime').reduce((n, a) => n + a.watched_episodes, 0);
    const byGenre = new Map<string, number>();
    const byStudio = new Map<string, number>();
    const byYear = new Map<number, number>();
    const byFormat = new Map<string, number>();
    for (const a of animes) {
      if (!a.watched_episodes) continue;
      // Las horas de un anime se reparten entre sus géneros para no contarlas varias veces
      for (const g of a.genres) byGenre.set(g, (byGenre.get(g) ?? 0) + a.watched_episodes / a.genres.length);
      for (const st of a.studios) byStudio.set(st, (byStudio.get(st) ?? 0) + 1);
      if (a.season_year) byYear.set(a.season_year, (byYear.get(a.season_year) ?? 0) + 1);
      if (a.format) byFormat.set(a.format, (byFormat.get(a.format) ?? 0) + 1);
    }
    const statusCount = new Map<AnimeStatus, number>();
    for (const a of animes) statusCount.set(a.status, (statusCount.get(a.status) ?? 0) + 1);
    const finishedOrDropped = (statusCount.get('completed') ?? 0) + (statusCount.get('dropped') ?? 0);
    const scored = animes.filter((a) => a.score);
    const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
      episodes,
      bookChapters,
      hours: Math.round(minutes / 60),
      top10: [...animes].filter((a) => a.score || a.is_favorite)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Number(b.is_favorite) - Number(a.is_favorite)).slice(0, 10),
      completed: statusCount.get('completed') ?? 0,
      dropRate: finishedOrDropped ? Math.round(((statusCount.get('dropped') ?? 0) / finishedOrDropped) * 100) : 0,
      avgScore: scored.length ? (scored.reduce((n, a) => n + a.score!, 0) / scored.length).toFixed(1) : '–',
      genres: top(byGenre, 8).map(([label, v]) => ({ label, value: v })),
      studios: top(byStudio, 6).map(([label, value]) => ({ label, value })),
      formats: top(byFormat, 6).map(([k, value]) => ({ label: FORMAT_LABELS[k] ?? k, value })),
      years: [...byYear.entries()].sort((a, b) => b[0] - a[0]).slice(0, 10).map(([y, value]) => ({ label: String(y), value })),
      statuses: (Object.keys(STATUS_LABELS) as AnimeStatus[]).map((k) => ({
        label: STATUS_LABELS[k], value: statusCount.get(k) ?? 0, color: STATUS_COLORS[k],
      })),
      missingMeta: animes.filter((a) => !a.genres.length).length,
    };
  }, [animes]);

  const heat = useMemo(() => {
    const counts = perDay(events);
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // empieza en domingo para alinear las filas
    const cells: { key: string; n: number }[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      cells.push({ key: k, n: counts.get(k) ?? 0 });
    }
    return cells;
  }, [events]);

  const { current, longest } = useMemo(() => streaks(events), [events]);
  const thisMonth = events.filter((e) => e.watched_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;
  const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

  if (!session) return null;

  return (
    <main className="container stack">
      <div>
        <span className="eyebrow">Estadísticas</span>
        <h1 style={{ marginTop: 8 }}>Tu año en anime</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Horas según la duración de cada capítulo en AniList ({MINUTES_PER_EPISODE} min si no se conoce).</p>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">Cargando…</p> : (
        <>
          <div className="stats" style={{ flex: 'none', maxWidth: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {[
              [s.hours + ' h', 'Horas vistas'], [s.episodes, 'Capítulos'], [s.completed, 'Terminados'],
              [`${current} ${current === 1 ? 'día' : 'días'}`, 'Racha actual'], [`${longest} ${longest === 1 ? 'día' : 'días'}`, 'Racha más larga'], [thisMonth, 'Capítulos este mes'],
              [s.avgScore, 'Puntuación media'], [s.dropRate + '%', 'Tasa de abandono'], [rewatches, 'Rewatches'],
              ...(s.bookChapters ? [[s.bookChapters, 'Caps. de manga/novela']] : []),
            ].map(([v, l]) => <div key={String(l)} className="stat"><strong>{v}</strong><span>{l}</span></div>)}
          </div>

          <SafeBoundary name="resumen del mes"><MonthlySummary username={username} initialMonth={initialMonth} /></SafeBoundary>

          {s.top10.length > 0 && (
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="section-head" style={{ marginBottom: 0 }}>
                <h2 className="section-label" style={{ margin: 0 }}>Tu top {s.top10.length}</h2>
                <span className="muted small">Según tu puntuación</span>
              </div>
              <ol className="top-list">
                {s.top10.map((a) => <li key={a.id}><span>{a.title}</span><span className="muted">{a.score ? `${a.score}/10` : '★'}</span></li>)}
              </ol>
              <div className="row">
                <ShareCard filename="zebanitracker-top10.png" label="Compartir mi top 10"
                  payload={() => ({
                    kind: 'top', name: username ?? undefined, title: `Mi top ${s.top10.length} de anime`,
                    subtitle: `${s.hours} h vistas · ${s.completed} terminados`,
                    items: s.top10.map((a) => ({ title: a.title, cover_url: a.cover_url, score: a.score })),
                  })} />
                <ShareCard filename="zebanitracker-stats.png" label="Compartir mis estadísticas"
                  payload={() => ({
                    kind: 'stats', name: username ?? undefined, title: 'Mis estadísticas de anime',
                    subtitle: `Puntuación media ${s.avgScore}`,
                    numbers: [
                      { value: `${s.hours} h`, label: 'vistas' }, { value: String(s.episodes), label: 'capítulos' },
                      { value: String(s.completed), label: 'terminados' }, { value: `${longest}`, label: 'días de racha máx.' },
                      { value: String(rewatches), label: 'rewatches' }, { value: `${s.dropRate}%`, label: 'abandono' },
                    ],
                    highlights: s.genres.slice(0, 3).map((g) => `${g.label}: ${hours(g.value)} h`),
                  })} />
              </div>
            </section>
          )}

          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="section-label">Actividad del último año</h2>
            <div className="heatmap" role="img" aria-label={`${events.length} capítulos marcados en el último año`}>
              {heat.map((c) => <i key={c.key} data-l={level(c.n)} title={`${c.key}: ${c.n} cap.`} />)}
            </div>
            <div className="legend">
              <span>Menos</span>
              {[0, 1, 2, 3, 4].map((l) => <i key={l} className="heat-sample" data-l={l} />)}
              <span>Más</span>
            </div>
            {!events.length && <p className="muted small" style={{ margin: 0 }}>El historial empieza a contar desde hoy: cada capítulo que marques aparecerá aquí.</p>}
          </section>

          <div className="stats-grid">
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Horas por género</h2>
              <Bars rows={s.genres} unit={(v) => `${hours(v)} h`} />
            </section>
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Por estado</h2>
              <Bars rows={s.statuses} unit={(v) => String(v)} />
            </section>
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Estudios favoritos</h2>
              <Bars rows={s.studios} unit={(v) => `${v} anime${v === 1 ? '' : 's'}`} />
            </section>
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Por año de estreno</h2>
              <Bars rows={s.years} unit={(v) => String(v)} />
            </section>
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Por formato</h2>
              <Bars rows={s.formats} unit={(v) => String(v)} />
            </section>
          </div>
          {s.missingMeta > 0 && (
            <p className="muted small">{s.missingMeta} animes aún no tienen géneros: se completan solos desde AniList al abrir tu lista.</p>
          )}
        </>
      )}
    </main>
  );
}
