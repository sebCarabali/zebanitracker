'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, Anime, AnimeStatus, STATUS_LABELS } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { AnimeCard } from '@/components/AnimeCard';

export default function HomePage() {
  const { session } = useAuth();
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [status, setStatus] = useState<AnimeStatus | ''>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      setLoading(true);
      api.list({ favorite, status, search: search.trim() })
        .then((data) => { setAnimes(data); setError(null); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [session, favorite, status, search]);

  const stats = useMemo(() => ({
    total: animes.length,
    episodes: animes.reduce((s, a) => s + a.watched_episodes, 0),
    watching: animes.filter((a) => a.status === 'watching').length,
  }), [animes]);

  if (!session) return null;

  function replace(a: Anime) {
    setAnimes((list) => (favorite && !a.is_favorite ? list.filter((x) => x.id !== a.id) : list.map((x) => (x.id === a.id ? a : x))));
  }

  return (
    <>
      <section className="toolbar">
        <input className="search" placeholder="Buscar anime…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as AnimeStatus | '')}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className={`btn ${favorite ? 'primary' : ''}`} onClick={() => setFavorite((f) => !f)}>
          ★ Favoritos
        </button>
      </section>

      <p className="muted small">
        {stats.total} animes · {stats.watching} en curso · {stats.episodes} capítulos vistos
      </p>

      {error && <p className="error">{error}</p>}
      {loading && animes.length === 0 ? (
        <p className="muted">Cargando…</p>
      ) : animes.length === 0 ? (
        <div className="empty">
          <p>{favorite || status || search ? 'Nada coincide con el filtro.' : 'Aún no tienes animes.'}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/import" className="btn">Importar mi lista de AniList</Link>
            <Link href="/animes/new" className="btn primary">Agregar el primero</Link>
          </div>
        </div>
      ) : (
        <section className="grid">
          {animes.map((a) => (
            <AnimeCard key={a.id} anime={a} onChange={replace} onDelete={(id) => setAnimes((l) => l.filter((x) => x.id !== id))} />
          ))}
        </section>
      )}
    </>
  );
}
