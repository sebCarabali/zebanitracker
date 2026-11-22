'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, AnimeStatus, PublicList, STATUS_COLORS, STATUS_LABELS } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { Brand } from '@/components/Header';
import { ProgressBar } from '@/components/AnimeCard';

const ORDER: AnimeStatus[] = ['watching', 'completed', 'on_hold', 'plan_to_watch', 'dropped'];

/** Lista compartida de un usuario (solo lectura, visible sin sesión). */
export default function PublicListPage() {
  const { username } = useParams<{ username: string }>();
  const { session } = useAuth();
  const [data, setData] = useState<PublicList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AnimeStatus | 'fav'>('watching');

  useEffect(() => {
    api.publicList(username).then((d) => {
      setData(d);
      if (!d.animes.some((a) => a.status === 'watching')) setTab(d.animes.some((a) => a.is_favorite) ? 'fav' : 'completed');
    }).catch((e) => setError(e.message));
  }, [username]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { fav: 0 };
    for (const a of data?.animes ?? []) { c[a.status] = (c[a.status] ?? 0) + 1; if (a.is_favorite) c.fav++; }
    return c;
  }, [data]);

  const items = (data?.animes ?? []).filter((a) => (tab === 'fav' ? a.is_favorite : a.status === tab));
  const episodes = (data?.animes ?? []).reduce((n, a) => n + a.watched_episodes, 0);

  return (
    <>
      {!session && (
        <header className="header">
          <Brand />
          <div className="header-actions"><Link href="/login" className="btn primary">Crea tu lista</Link></div>
        </header>
      )}
      <main className="container stack">
        {error ? (
          <div className="empty">{error}</div>
        ) : !data ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            <section className="hello">
              <div>
                <span className="eyebrow">Lista pública</span>
                <h1 style={{ marginTop: 8 }}>@{data.username}</h1>
                <p>{data.animes.length} títulos · {episodes} capítulos vistos</p>
                {session && (
                  <div className="row">
                    <Link href={`/friends/${data.username}`} className="btn primary">Comparar con mi lista</Link>
                    <button className="btn" onClick={() => api.follow(data.username).then(() => alert(`Ahora sigues a @${data.username}`)).catch((e) => alert(e.message))}>Seguir</button>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="tabs" role="tablist" aria-label="Filtrar por estado" style={{ marginBottom: 20 }}>
                {ORDER.map((s) => (
                  <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
                    {STATUS_LABELS[s]}<span className="badge-count">{counts[s] ?? 0}</span>
                  </button>
                ))}
                <button role="tab" aria-selected={tab === 'fav'} onClick={() => setTab('fav')}>
                  Favoritos<span className="badge-count">{counts.fav}</span>
                </button>
              </div>
              {items.length === 0 ? <div className="empty">Nada en esta sección.</div> : (
                <div className="grid">
                  {items.map((a, i) => {
                    const total = a.total_episodes;
                    const pct = total ? Math.round((a.watched_episodes / total) * 100) : 0;
                    const inner = (
                      <Cover src={a.cover_url} title={a.title}>
                        <span className="pill" style={{ '--c': STATUS_COLORS[a.status] } as React.CSSProperties}><span className="dot" />{STATUS_LABELS[a.status]}</span>
                        {a.score && <span className="score-pill">★ {a.score}</span>}
                      </Cover>
                    );
                    return (
                      <article key={`${a.anilist_id ?? a.title}-${i}`} className="card">
                        {a.anilist_id && session ? <Link href={`/explore/${a.anilist_id}`} className="card-link">{inner}</Link> : inner}
                        <div className="card-body">
                          <h3 title={a.title}>{a.is_favorite ? '★ ' : ''}{a.title}</h3>
                          <div className="progress-row">
                            <ProgressBar pct={pct} color={STATUS_COLORS[a.status]} />
                            <span>{a.watched_episodes}/{total ?? '?'}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
