'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, Anime, AnimeStatus } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { AnimeCard, ContinueCard } from '@/components/AnimeCard';
import { SearchIcon } from '@/components/Icons';

type Tab = 'all' | 'fav' | AnimeStatus;
const TABS: [Tab, string][] = [
  ['all', 'Todos'], ['watching', 'Viendo'], ['completed', 'Completados'], ['plan_to_watch', 'Pendientes'],
  ['on_hold', 'En pausa'], ['dropped', 'Abandonados'], ['fav', 'Favoritos'],
];

function greetingName(email?: string) {
  const raw = (email ?? '').split('@')[0].split(/[._-]/)[0];
  return raw ? raw[0].toUpperCase() + raw.slice(1) : '';
}

export default function HomePage() {
  const { session } = useAuth();
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api.list()
      .then((data) => { if (!cancelled) setAnimes(data); })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    // Completa capítulos/emisión desde AniList en segundo plano (el servidor solo revisa lo desactualizado)
    api.syncEpisodes()
      .then((r) => (r.updated > 0 ? api.list() : null))
      .then((data) => { if (data && !cancelled) setAnimes(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  const replace = (a: Anime) => setAnimes((list) => list.map((x) => (x.id === a.id ? a : x)));

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: animes.length, fav: animes.filter((a) => a.is_favorite).length };
    for (const a of animes) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [animes]);

  const continueList = useMemo(
    () => animes
      .filter((a) => a.status === 'watching')
      .sort((a, b) => (b.last_watched_at ?? b.updated_at).localeCompare(a.last_watched_at ?? a.updated_at))
      .slice(0, 3),
    [animes],
  );

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    return animes
      .filter((a) => tab === 'all' || (tab === 'fav' ? a.is_favorite : a.status === tab))
      .filter((a) => !q || a.title.toLowerCase().includes(q));
  }, [animes, tab, query]);

  const episodes = animes.reduce((n, a) => n + a.watched_episodes, 0);
  const stats = [
    { value: animes.length, label: 'Animes' },
    { value: counts.watching ?? 0, label: 'En curso' },
    { value: episodes, label: 'Capítulos vistos' },
    { value: `${Math.round((episodes * 24) / 60)} h`, label: 'Horas vistas' },
  ];

  if (!session) return null;
  const name = greetingName(session.user.email);
  const rawDate = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  return (
    <main className="container stack">
      <section className="hello">
        <div>
          <span className="muted small">{today}</span>
          <h1>Hola{name ? `, ${name}` : ''}</h1>
          <p>
            {loading ? 'Cargando tu lista…'
              : animes.length === 0 ? 'Tu lista está vacía. Empieza explorando o importando de AniList.'
              : `Tienes ${counts.watching ?? 0} animes en curso. Sigue donde lo dejaste.`}
          </p>
        </div>
        <div className="stats">
          {stats.map((s) => (
            <div key={s.label} className="stat"><strong>{s.value}</strong><span>{s.label}</span></div>
          ))}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {continueList.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Continúa viendo</h2>
            <span className="muted small">Marca el capítulo con un clic</span>
          </div>
          <div className="continue-grid">
            {continueList.map((a) => <ContinueCard key={a.id} anime={a} onChange={replace} />)}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Mi biblioteca</h2>
          <label className="search" style={{ flex: '0 1 320px' }}>
            <SearchIcon />
            <span className="sr-only">Buscar en mi lista</span>
            <input placeholder="Buscar en mi lista…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="tabs" role="tablist" aria-label="Filtrar por estado" style={{ marginBottom: 20 }}>
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}<span className="badge-count">{counts[id] ?? 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : library.length === 0 ? (
          <div className="empty">
            <p>{animes.length ? 'Nada por aquí con este filtro.' : 'Aún no tienes animes.'}</p>
            {!animes.length && (
              <div className="row">
                <Link href="/explore" className="btn primary">Explorar el catálogo</Link>
                <Link href="/import" className="btn">Importar de AniList</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid">
            {library.map((a) => <AnimeCard key={a.id} anime={a} onChange={replace} />)}
          </div>
        )}
      </section>
    </main>
  );
}
