'use client';

import { useEffect, useState } from 'react';
import { api, Anime, knownEpisodes } from '@/lib/api';

/** "Vi del 5 al 12": cada capítulo queda en el historial y cuenta para la racha. */
export function RangeMark({ anime, onDone }: { anime: Anime; onDone: (a: Anime, logged: number) => void }) {
  const max = knownEpisodes(anime);
  const [from, setFrom] = useState(String(anime.watched_episodes + 1));
  const [to, setTo] = useState(String(Math.min(anime.watched_episodes + 4, max ?? anime.watched_episodes + 4)));
  const [when, setWhen] = useState<'now' | 'yesterday' | 'custom'>('now');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Si el progreso cambia desde otro control, el rango sugerido sigue desde el siguiente capítulo
  useEffect(() => {
    const next = anime.watched_episodes + 1;
    setFrom(String(next));
    setTo(String(Math.min(next + 3, knownEpisodes(anime) ?? next + 3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.watched_episodes]);

  const f = Number(from), t = Number(to);
  const invalid = !f || !t || f < 1 || t < f || (max !== null && t > max);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setMsg(null);
    try {
      const at = when === 'now' ? undefined
        : when === 'yesterday' ? new Date(Date.now() - 86_400_000).toISOString()
        : new Date(`${date}T21:00:00`).toISOString();
      const r = await api.markRange(anime.id, f, t, at);
      onDone(r.anime, r.logged);
      setMsg({ text: `✓ ${r.logged} capítulos registrados en tu historial`, ok: true });
      const next = r.anime.watched_episodes + 1;
      setFrom(String(next));
      setTo(String(Math.min(next + 3, knownEpisodes(r.anime) ?? next + 3)));
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="range-mark" onSubmit={submit}>
      <div className="range-inputs">
        <span>Vi del</span>
        <input type="number" min={1} max={max ?? undefined} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde el capítulo" />
        <span>al</span>
        <input type="number" min={1} max={max ?? undefined} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta el capítulo" />
        <select value={when} onChange={(e) => setWhen(e.target.value as typeof when)} aria-label="Cuándo">
          <option value="now">hoy</option>
          <option value="yesterday">ayer</option>
          <option value="custom">otro día…</option>
        </select>
        {when === 'custom' && (
          <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
        )}
        <button className="btn navy" disabled={busy || invalid}>{busy ? 'Marcando…' : `Marcar ${invalid ? '' : t - f + 1} caps.`}</button>
      </div>
      {msg && <p className={`small ${msg.ok ? 'ok' : 'error'}`} style={{ margin: 0 }}>{msg.text}</p>}
      {!msg && f > 0 && f <= anime.watched_episodes && !invalid && (
        <p className="muted small" style={{ margin: 0 }}>Ya ibas en el {anime.watched_episodes}: se registran en el historial sin cambiar tu progreso.</p>
      )}
    </form>
  );
}
