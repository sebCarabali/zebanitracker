'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, Anime, StaleAnime } from '@/lib/api';
import { Cover } from './Cover';

/** "¿Lo retomas o lo dejas?" para series en "viendo" sin avance hace semanas. */
export function StaleReminders({ onChange }: { onChange: (a: Anime) => void }) {
  const [items, setItems] = useState<StaleAnime[]>([]);
  const [weeks, setWeeks] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.stale().then((r) => { setItems(Array.isArray(r?.items) ? r.items : []); setWeeks(r?.weeks ?? 3); }).catch(() => {});
  }, []);

  if (!items.length) return null;

  async function act(a: StaleAnime, action: 'resume' | 'drop' | 'snooze') {
    setBusy(a.id);
    try {
      const updated = await api.staleAction(a.id, action);
      onChange(updated);
      setItems((l) => l.filter((x) => x.id !== a.id));
      if (action === 'resume') window.location.href = `/animes/${a.id}`;
    } catch { /* se queda en la lista */ } finally {
      setBusy(null);
    }
  }

  return (
    <section className="stale">
      <div className="section-head">
        <h2>¿Lo retomas o lo dejas?</h2>
        <span className="muted small">Más de {weeks} semanas sin avanzar · <Link href="/settings">cambiar</Link></span>
      </div>
      <div className="stale-list">
        {items.slice(0, 4).map((a) => (
          <article key={a.id} className="stale-card">
            <Cover src={a.cover_url} title={a.title} />
            <div className="stale-body">
              <h3><Link href={`/animes/${a.id}`}>{a.title}</Link></h3>
              <span className="muted small">
                Vas en el cap. {a.watched_episodes}{a.total_episodes ? ` de ${a.total_episodes}` : ''} · hace {a.idle_days} días
              </span>
              <div className="row">
                <button className="btn primary" disabled={busy === a.id} onClick={() => act(a, 'resume')}>▶ Lo retomo</button>
                <button className="btn" disabled={busy === a.id} onClick={() => act(a, 'drop')}>Lo dejo</button>
                <button className="link small" disabled={busy === a.id} onClick={() => act(a, 'snooze')}>Más tarde</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {items.length > 4 && <p className="muted small">Y {items.length - 4} más en tu lista “Viendo”.</p>}
    </section>
  );
}
