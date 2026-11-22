'use client';

import { useEffect, useState } from 'react';
import { api, Anime, Rewatch } from '@/lib/api';

/** Contador de rewatch: cuántas veces lo terminaste de nuevo, con fecha. */
export function RewatchPanel({ anime, onChange }: { anime: Anime; onChange: (a: Anime) => void }) {
  const [items, setItems] = useState<Rewatch[]>([]);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.rewatches(anime.id).then((r) => setItems(Array.isArray(r) ? r : [])).catch(() => {}); }, [anime.id, anime.rewatching]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const canStart = anime.status === 'completed' && !anime.rewatching;
  const times = items.length;

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-label" style={{ margin: 0 }}>Rewatch</h2>
        <span className="rewatch-count" aria-label={`Visto de nuevo ${times} veces`}>↻ {times}</span>
      </div>
      {anime.rewatching ? (
        <div className="banner small" style={{ flexWrap: 'wrap' }}>
          Estás viéndolo otra vez{times ? ` (rewatch n.º ${times + 1})` : ''}. Al llegar al último capítulo se suma al contador.
          <button className="link" style={{ color: 'var(--cream)' }} disabled={busy}
            onClick={() => act(async () => onChange(await api.cancelRewatch(anime.id)))}>Cancelar rewatch</button>
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {times ? `Lo has vuelto a ver ${times === 1 ? '1 vez' : `${times} veces`}.` : 'Aún no lo has vuelto a ver.'}
        </p>
      )}
      <div className="row">
        {canStart && (
          <button className="btn navy" disabled={busy} onClick={() => act(async () => onChange(await api.startRewatch(anime.id)))}>
            ↻ Empezar a verlo otra vez
          </button>
        )}
        <button className="btn ghost" onClick={() => setAdding((a) => !a)}>{adding ? 'Cerrar' : '+ Registrar uno pasado'}</button>
      </div>
      {adding && (
        <form className="form" style={{ gap: 8 }} onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            const r = await api.addRewatch(anime.id, { finished_at: new Date(`${date}T12:00:00`).toISOString(), note: note.trim() || undefined });
            setItems((l) => [r, ...l].sort((a, b) => b.finished_at.localeCompare(a.finished_at)));
            setAdding(false); setNote('');
          });
        }}>
          <label>Lo terminé el
            <input type="date" required value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>Nota (opcional)
            <input maxLength={500} placeholder="Con mi hermano, en el doblaje latino…" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn primary" disabled={busy}>Guardar</button>
        </form>
      )}
      {items.length > 0 && (
        <ol className="rewatch-list">
          {items.map((r, i) => (
            <li key={r.id}>
              <span><strong>#{items.length - i}</strong> · {new Date(r.finished_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                {r.note && <span className="muted"> — {r.note}</span>}</span>
              <button className="link danger small" aria-label="Borrar este rewatch" disabled={busy}
                onClick={() => act(async () => { await api.removeRewatch(r.id); setItems((l) => l.filter((x) => x.id !== r.id)); })}>×</button>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
