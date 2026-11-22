'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, Comparison, STATUS_LABELS, AnimeStatus } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { BackIcon } from '@/components/Icons';

function verdict(c: number | null) {
  if (c === null) return 'Aún hay pocos datos para comparar';
  if (c >= 80) return '¡Almas gemelas del anime!';
  if (c >= 60) return 'Gustos muy parecidos';
  if (c >= 40) return 'Coinciden en bastantes cosas';
  if (c >= 20) return 'Gustos distintos, buenas recomendaciones mutuas';
  return 'Polos opuestos';
}

export default function ComparePage() {
  const { username } = useParams<{ username: string }>();
  const { session } = useAuth();
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!session) return;
    api.compare(username).then(setData).catch((e) => setError(e.message));
  }, [session, username]);

  async function add(id: number, title: string, cover: string | null) {
    try {
      await api.create({ title, anilist_id: id, cover_url: cover, status: 'plan_to_watch', watched_episodes: 0 });
      setAdded((s) => new Set(s).add(id));
    } catch (e) { setError((e as Error).message); }
  }

  if (!session) return null;
  if (error && !data) return <main className="container"><p className="error">{error}</p><Link href="/friends">← Amigos</Link></main>;
  if (!data) return <main className="container"><p className="muted">Comparando listas…</p></main>;
  const c = data.compatibility;

  return (
    <main className="container stack">
      <Link href="/friends" className="back" style={{ color: 'var(--muted)' }}><BackIcon /> Amigos</Link>
      <section className="hello">
        <div>
          <span className="eyebrow">Tú y @{data.username}</span>
          <h1 style={{ marginTop: 8 }}>{verdict(c)}</h1>
          <p>
            {data.common.length} títulos en común
            {data.shared_genres.length ? ` · a ambos les encanta ${data.shared_genres.slice(0, 3).join(', ')}` : ''}
          </p>
          <div className="row">
            {!data.following && <button className="btn primary" onClick={async () => { await api.follow(data.username); setData({ ...data, following: true }); }}>Seguir</button>}
            <Link href={`/u/${data.username}`} className="btn">Ver su lista</Link>
          </div>
        </div>
        <div className="compat-ring" aria-label={c !== null ? `Compatibilidad ${c}%` : 'Compatibilidad desconocida'}>
          <strong>{c !== null ? `${c}%` : '¿?'}</strong>
          <span>compatibilidad</span>
        </div>
      </section>

      <div className="stats" style={{ flex: 'none', maxWidth: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <div className="stat"><strong>{data.breakdown.genres}%</strong><span>Géneros parecidos</span></div>
        <div className="stat"><strong>{data.breakdown.scores ?? '—'}{data.breakdown.scores !== null ? '%' : ''}</strong><span>Acuerdo en notas</span></div>
        <div className="stat"><strong>{data.breakdown.overlap}%</strong><span>Títulos en común</span></div>
      </div>

      <div className="stats-grid">
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="section-label">Tus géneros</h2>
          <div className="chips">{data.my_top_genres.map((g) => <span key={g} className={`chip ${data.shared_genres.includes(g) ? 'on' : ''}`}>{g}</span>)}</div>
        </section>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="section-label">Géneros de @{data.username}</h2>
          <div className="chips">{data.their_top_genres.map((g) => <span key={g} className={`chip ${data.shared_genres.includes(g) ? 'on' : ''}`}>{g}</span>)}</div>
        </section>
      </div>

      {data.recommended_from_them.length > 0 && (
        <section>
          <div className="section-head"><h2>Le encantan y tú no los tienes</h2></div>
          <div className="rail">
            {data.recommended_from_them.map((r) => (
              <article key={r.anilist_id} className="result">
                <Cover src={r.cover_url} title={r.title}>
                  <Link href={`/explore/${r.anilist_id}`} className="cover-link" aria-label={`Ver ficha de ${r.title}`} />
                  {r.score && <span className="score">{r.score}/10</span>}
                </Cover>
                <div className="result-info">
                  <h3><Link href={`/explore/${r.anilist_id}`}>{r.title}</Link></h3>
                  {added.has(r.anilist_id)
                    ? <span className="ok small">✓ En pendientes</span>
                    : <button className="btn small" onClick={() => add(r.anilist_id, r.title, r.cover_url)}>+ Pendiente</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head"><h2>En común ({data.common.length})</h2></div>
        {!data.common.length ? <div className="empty">Aún no tienen títulos en común.</div> : (
          <div className="common-list">
            {data.common.map((x) => (
              <div key={x.anilist_id} className="common-row">
                <Cover src={x.cover_url} title={x.title} />
                <Link href={`/explore/${x.anilist_id}`}><strong>{x.title}</strong>{x.both_favorite && ' ★'}</Link>
                <span className="small">Tú: {x.my_score ? `${x.my_score}/10` : STATUS_LABELS[x.my_status as AnimeStatus]}</span>
                <span className="small">@{data.username}: {x.their_score ? `${x.their_score}/10` : STATUS_LABELS[x.their_status as AnimeStatus]}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.disagreements.length > 0 && (
        <section className="panel">
          <h2 className="section-label">Donde no se ponen de acuerdo</h2>
          <ul>{data.disagreements.map((d) => <li key={d.anilist_id}>{d.title}: tú {d.my_score}/10, @{data.username} {d.their_score}/10</li>)}</ul>
        </section>
      )}
    </main>
  );
}
