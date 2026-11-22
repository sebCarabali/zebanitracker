'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, Anime, formatDuration, MEDIA_LABELS, remainingMinutes } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';

/** Ánimos → géneros/etiquetas de AniList que encajan. */
const MOODS: { id: string; label: string; genres: string[] }[] = [
  { id: 'any', label: '🎲 Sorpréndeme', genres: [] },
  { id: 'chill', label: '☕ Relajado', genres: ['Slice of Life', 'Comedy'] },
  { id: 'hype', label: '🔥 Con emoción', genres: ['Action', 'Adventure', 'Sports'] },
  { id: 'cry', label: '😭 Para llorar', genres: ['Drama', 'Romance'] },
  { id: 'think', label: '🧠 Para pensar', genres: ['Mystery', 'Psychological', 'Sci-Fi', 'Thriller'] },
  { id: 'laugh', label: '😂 Para reír', genres: ['Comedy'] },
  { id: 'scary', label: '👻 Con miedo', genres: ['Horror', 'Thriller', 'Supernatural'] },
  { id: 'magic', label: '✨ Fantasía', genres: ['Fantasy', 'Mahou Shoujo'] },
];
const TIMES: [number | null, string][] = [[null, 'Sin límite'], [30, '≈ 30 min'], [90, '≈ 1-2 h'], [300, 'Una tarde'], [800, 'Un fin de semana']];

export default function PlanPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [mood, setMood] = useState('any');
  const [time, setTime] = useState<number | null>(null);
  const [pick, setPick] = useState<Anime | null>(null);
  const [spinning, setSpinning] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!session) return;
    api.list({ status: 'plan_to_watch' })
      .then((l) => setItems(sortByPriority(l)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  const total = useMemo(() => items.reduce((n, a) => n + (remainingMinutes(a) ?? 0), 0), [items]);
  const unknown = items.filter((a) => a.media_type === 'anime' && remainingMinutes(a) === null).length;
  const books = items.filter((a) => a.media_type !== 'anime');
  const bookChapters = books.reduce((n, a) => n + Math.max(0, (a.total_episodes ?? 0) - a.watched_episodes), 0);

  function persist(next: Anime[]) {
    setItems(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try { await api.reorder(next.map((a) => a.id)); } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
    }, 600);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    persist(next.map((a, i) => ({ ...a, priority: i })));
  }

  function choose() {
    const mo = MOODS.find((m) => m.id === mood)!;
    let pool = items.filter((a) => !mo.genres.length || a.genres.some((g) => mo.genres.includes(g)));
    if (time) pool = pool.filter((a) => { const m = remainingMinutes(a); return m !== null && m <= time * 1.25; });
    if (!pool.length) { setPick(null); setError('Nada de tu lista encaja con eso. Prueba otro ánimo o más tiempo.'); return; }
    setError(null);
    // Los primeros de tu lista tienen más probabilidades (peso decreciente según la prioridad)
    const weights = pool.map((a) => 1 / (1 + items.indexOf(a) * 0.15));
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    let chosen = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { chosen = pool[i]; break; } }
    setSpinning(true);
    setTimeout(() => { setPick(chosen); setSpinning(false); }, 450);
  }

  async function start(a: Anime) {
    try {
      await api.update(a.id, { status: 'watching' });
      window.location.href = `/animes/${a.id}`;
    } catch (e) { setError((e as Error).message); }
  }

  if (!session) return null;

  return (
    <main className="container stack">
      <section className="hello">
        <div>
          <span className="eyebrow">Planeo ver</span>
          <h1 style={{ marginTop: 8 }}>Tu cola de pendientes</h1>
          <p>Arrastra para ordenar por prioridad. Lo de arriba sale más en “¿Qué veo hoy?”.</p>
        </div>
        <div className="stats">
          <div className="stat"><strong>{items.length}</strong><span>Pendientes</span></div>
          <div className="stat"><strong>{total ? formatDuration(total) : '—'}</strong><span>De anime{unknown ? ` (+${unknown} sin datos)` : ''}</span></div>
          {books.length > 0 && <div className="stat"><strong>{bookChapters || '?'}</strong><span>Caps. de manga/novela</span></div>}
        </div>
      </section>

      <section className="panel picker">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2>¿Qué veo hoy?</h2>
          {saving && <span className="muted small">Guardando orden…</span>}
        </div>
        <div className="chips" role="radiogroup" aria-label="Ánimo">
          {MOODS.map((m) => (
            <button key={m.id} role="radio" aria-checked={mood === m.id} className={`chip ${mood === m.id ? 'on' : ''}`} onClick={() => setMood(m.id)}>{m.label}</button>
          ))}
        </div>
        <div className="row">
          <label className="row muted small">Tiempo
            <select value={time ?? ''} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : null)}>
              {TIMES.map(([v, l]) => <option key={l} value={v ?? ''}>{l}</option>)}
            </select>
          </label>
          <button className="btn primary lg" disabled={!items.length || spinning} onClick={choose}>{spinning ? 'Eligiendo…' : pick ? 'Otro' : 'Elegir por mí'}</button>
        </div>
        {pick && !spinning && (
          <div className="pick-card">
            <Cover src={pick.cover_url} title={pick.title} />
            <div>
              <span className="eyebrow">Hoy toca</span>
              <h3>{pick.title}</h3>
              <p className="muted small">
                {[pick.media_type !== 'anime' ? MEDIA_LABELS[pick.media_type] : null, pick.genres.slice(0, 3).join(', '),
                  remainingMinutes(pick) ? formatDuration(remainingMinutes(pick)!) : null].filter(Boolean).join(' · ')}
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => start(pick)}>▶ Empezar ahora</button>
                <Link href={`/animes/${pick.id}`} className="btn">Ver ficha</Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <section>
        <div className="section-head"><h2>Prioridad</h2><span className="muted small">También puedes usar ↑ ↓</span></div>
        {loading ? <p className="muted">Cargando…</p> : !items.length ? (
          <div className="empty">
            <p>No tienes pendientes.</p>
            <Link href="/explore" className="btn primary">Buscar algo para ver</Link>
          </div>
        ) : (
          <ol className="plan-list">
            {items.map((a, i) => {
              const mins = remainingMinutes(a);
              return (
                <li key={a.id} draggable
                  className={`plan-item ${dragId === a.id ? 'dragging' : ''} ${overId === a.id && dragId !== a.id ? 'over' : ''}`}
                  onDragStart={(e) => { setDragId(a.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(a.id); }}
                  onDragLeave={() => setOverId((o) => (o === a.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); const from = items.findIndex((x) => x.id === dragId); move(from, i); setDragId(null); setOverId(null); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}>
                  <span className="grip" aria-hidden>⋮⋮</span>
                  <span className="rank">{i + 1}</span>
                  <Cover src={a.cover_url} title={a.title} />
                  <div className="plan-info">
                    <Link href={`/animes/${a.id}`}><strong>{a.title}</strong></Link>
                    <span className="muted small">
                      {[a.media_type !== 'anime' ? MEDIA_LABELS[a.media_type] : null,
                        a.total_episodes ? `${a.total_episodes} caps.` : null,
                        mins ? formatDuration(mins) : null,
                        a.genres.slice(0, 2).join(', ') || null].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="plan-actions">
                    <button className="btn icon ghost" aria-label={`Subir ${a.title}`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button className="btn icon ghost" aria-label={`Bajar ${a.title}`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    <button className="btn ghost small" aria-label={`Poner ${a.title} primero`} disabled={i === 0} onClick={() => move(i, 0)}>Primero</button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

/** Con prioridad primero (en su orden); los nuevos sin prioridad al final, del más reciente al más antiguo. */
function sortByPriority(list: Anime[]) {
  return [...list].sort((a, b) => {
    if (a.priority === null && b.priority === null) return b.created_at.localeCompare(a.created_at);
    if (a.priority === null) return 1;
    if (b.priority === null) return -1;
    return a.priority - b.priority;
  });
}
