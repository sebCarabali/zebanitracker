'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, CatalogAnime, Party } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { CatalogSearch } from '@/components/CatalogSearch';
import { Cover } from '@/components/Cover';

/** Ver juntos: el avance compartido es el capítulo que TODOS ya vieron. */
export default function TogetherPage() {
  const { session } = useAuth();
  const [parties, setParties] = useState<Party[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => api.parties().then(setParties).catch((e) => setError(e.message));

  useEffect(() => {
    if (!session) return;
    const join = new URLSearchParams(window.location.search).get('join');
    if (join) {
      setBusy(true);
      api.joinParty(join).then(() => window.history.replaceState(null, '', '/together')).catch((e) => setError(e.message))
        .finally(() => { setBusy(false); load(); });
    } else load();
  }, [session]);

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try { return await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const update = (p: Party) => setParties((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));

  async function create(a: CatalogAnime) {
    const p = await act(() => api.createParty({ anilist_id: a.anilist_id }));
    if (p) { setParties((l) => [p, ...(l ?? [])]); setCreating(false); }
  }

  function invite(p: Party) {
    const url = `${window.location.origin}/together?join=${p.invite_code}`;
    const text = `¡Veamos ${p.title} juntos en ZebaniTracker! ${url}`;
    if (navigator.share) navigator.share({ title: p.title, text, url }).catch(() => {});
    else { navigator.clipboard?.writeText(url); setCopied(p.id); setTimeout(() => setCopied(null), 2000); }
  }

  if (!session) return null;

  return (
    <main className="container stack">
      <div>
        <span className="eyebrow">Ver juntos</span>
        <h1 style={{ marginTop: 8 }}>Series compartidas</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Con tu pareja o un amigo: cada uno marca lo que vio y el avance solo cuenta cuando todos vieron el capítulo.
          Si la serie está en tu lista, tu progreso se actualiza con el avance compartido.
        </p>
      </div>

      <div className="stats-grid">
        <section className="panel form">
          <h2 className="section-label">Nueva serie compartida</h2>
          {creating ? (
            <>
              <CatalogSearch onSelect={create} />
              <button className="btn ghost" onClick={() => setCreating(false)}>Cancelar</button>
            </>
          ) : <button className="btn primary" onClick={() => setCreating(true)}>+ Elegir anime</button>}
        </section>
        <form className="panel form" onSubmit={async (e) => {
          e.preventDefault();
          const p = await act(() => api.joinParty(code.trim()));
          if (p) { setCode(''); load(); }
        }}>
          <h2 className="section-label">Unirme con un código</h2>
          <div className="row">
            <input className="grow" placeholder="Código de invitación" value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
            <button className="btn navy" disabled={busy || code.trim().length < 6}>Unirme</button>
          </div>
        </form>
      </div>
      {error && <p className="error">{error}</p>}

      {!parties ? <p className="muted">Cargando…</p> : !parties.length ? (
        <div className="empty">Aún no tienes series compartidas. Crea una e invita con el enlace.</div>
      ) : (
        <div className="party-list">
          {parties.map((p) => {
            const total = p.total_episodes;
            const myNext = p.my_progress + 1;
            const ahead = p.my_progress > p.shared_progress;
            return (
              <article key={p.id} className="panel party">
                <Cover src={p.cover_url} title={p.title} />
                <div className="party-body">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0 }}>{p.anilist_id ? <Link href={`/explore/${p.anilist_id}`}>{p.title}</Link> : p.title}</h3>
                    <span className="pill-inline">Juntos: cap. {p.shared_progress}{total ? ` / ${total}` : ''}</span>
                  </div>
                  <div className="party-members">
                    {p.members.map((m) => {
                      const pct = total ? Math.round((m.watched_episodes / total) * 100) : null;
                      return (
                        <div key={m.user_id} className="member">
                          <span className="avatar small" aria-hidden>{m.name.slice(0, 1)}</span>
                          <span className="grow">{m.is_me ? 'Tú' : m.name}</span>
                          <span className="muted small">cap. {m.watched_episodes}</span>
                          {pct !== null && <div className="progress" style={{ width: 90 }}><div style={{ width: `${pct}%` }} /></div>}
                        </div>
                      );
                    })}
                  </div>
                  {p.members.length < 2 && <p className="muted small" style={{ margin: 0 }}>Invita a alguien para empezar a ver juntos.</p>}
                  {ahead && p.waiting_for.length > 0 && (
                    <p className="small" style={{ margin: 0 }}>⏳ Esperando a {p.waiting_for.join(', ')} para contar el cap. {p.shared_progress + 1}.</p>
                  )}
                  {p.list_synced && <p className="ok small" style={{ margin: 0 }}>✓ Tu lista se actualizó al cap. {p.shared_progress}.</p>}
                  <div className="row">
                    <button className="btn primary" disabled={busy || (total !== null && p.my_progress >= total)}
                      onClick={async () => { const u = await act(() => api.partyProgress(p.id, myNext)); if (u) update(u); }}>
                      {total !== null && p.my_progress >= total ? 'Terminaste' : `Vi el cap. ${myNext}`}
                    </button>
                    {p.my_progress > 0 && (
                      <button className="btn ghost" disabled={busy} aria-label="Deshacer un capítulo"
                        onClick={async () => { const u = await act(() => api.partyProgress(p.id, p.my_progress - 1)); if (u) update(u); }}>−1</button>
                    )}
                    <button className="btn" onClick={() => invite(p)}>{copied === p.id ? '✓ Enlace copiado' : 'Invitar'}</button>
                    <span className="muted small">Código: <code>{p.invite_code}</code></span>
                    <button className="link danger small" style={{ marginLeft: 'auto' }}
                      onClick={async () => {
                        if (!confirm(p.is_owner ? `¿Borrar el grupo de ${p.title} para todos?` : `¿Salir del grupo de ${p.title}?`)) return;
                        await act(() => api.leaveParty(p.id));
                        setParties((l) => (l ?? []).filter((x) => x.id !== p.id));
                      }}>{p.is_owner ? 'Borrar' : 'Salir'}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
