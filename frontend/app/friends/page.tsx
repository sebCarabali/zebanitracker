'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, Profile, SocialOverview } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

export default function FriendsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<SocialOverview | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.social().then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    if (!session) return;
    load();
    api.profile().then(setProfile).catch(() => {});
  }, [session]);

  async function follow(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim().replace(/^@/, '').toLowerCase();
    if (!u) return;
    setBusy(true);
    setError(null);
    try {
      await api.follow(u);
      setUsername('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unfollow(u: string) {
    if (!confirm(`¿Dejar de seguir a @${u}?`)) return;
    try { await api.unfollow(u); await load(); } catch (e) { setError((e as Error).message); }
  }

  if (!session) return null;
  const shareUrl = profile?.username ? `${typeof window !== 'undefined' ? window.location.origin : ''}/u/${profile.username}` : null;

  return (
    <main className="container stack">
      <div>
        <span className="eyebrow">Amigos</span>
        <h1 style={{ marginTop: 8 }}>Compara gustos con tus amigos</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Sigue listas públicas, mira qué tienen en común y cuánto coinciden.</p>
      </div>

      {profile && (!profile.username || !profile.is_public) && (
        <div className="banner" style={{ flexWrap: 'wrap' }}>
          Para que te sigan y comparen contigo, elige un nombre de usuario y haz pública tu lista.
          <Link href="/settings">Ir a Ajustes →</Link>
        </div>
      )}
      {shareUrl && profile?.is_public && (
        <div className="panel row" style={{ justifyContent: 'space-between' }}>
          <span>Tu lista pública: <strong>@{profile.username}</strong></span>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copiar enlace para invitar</button>
        </div>
      )}

      <form className="panel row" onSubmit={follow}>
        <label className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Seguir a alguien</span>
          <input placeholder="nombre_de_usuario" value={username} maxLength={25} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy || !username.trim()} style={{ alignSelf: 'flex-end' }}>{busy ? 'Siguiendo…' : 'Seguir'}</button>
      </form>
      {error && <p className="error">{error}</p>}

      <section>
        <div className="section-head"><h2>Sigues a {data?.following.length ?? 0}</h2></div>
        {!data ? <p className="muted">Cargando…</p> : !data.following.length ? (
          <div className="empty">Aún no sigues a nadie. Pide a tus amigos su nombre de usuario de ZebaniTracker.</div>
        ) : (
          <div className="friend-grid">
            {data.following.map((f) => (
              <article key={f.username} className="panel friend-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row">
                    <span className="avatar" aria-hidden>{f.username.slice(0, 1)}</span>
                    <strong>@{f.username}</strong>
                  </div>
                  {f.compatibility !== null && <span className={`compat c${Math.floor(f.compatibility / 25)}`}>{f.compatibility}%</span>}
                </div>
                <span className="muted small">
                  {f.available ? `${f.common} en común de ${f.total}` : 'Su lista ya no es pública'}
                </span>
                <div className="row">
                  {f.available && <Link href={`/friends/${f.username}`} className="btn primary">Comparar</Link>}
                  {f.available && <Link href={`/u/${f.username}`} className="btn">Ver lista</Link>}
                  <button className="link danger small" onClick={() => unfollow(f.username)}>Dejar de seguir</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {data && data.followers.length > 0 && (
        <section>
          <div className="section-head"><h2>Te siguen {data.followers.length}</h2></div>
          <div className="chips">
            {data.followers.map((f) => (
              f.follows_back || !f.is_public
                ? <span key={f.username} className="chip">@{f.username}</span>
                : <button key={f.username} className="chip" onClick={async () => { await api.follow(f.username).catch(() => null); load(); }}>+ Seguir a @{f.username}</button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
