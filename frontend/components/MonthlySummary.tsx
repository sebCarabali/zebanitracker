'use client';

import { useEffect, useState } from 'react';
import { api, formatDuration, Monthly } from '@/lib/api';
import { ShareCard } from './ShareCard';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const s = new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resumen del mes: cifras reales y un texto con humor generado por IA. */
export function MonthlySummary({ username, initialMonth }: { username?: string | null; initialMonth?: string }) {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const [month, setMonth] = useState(initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : months[0]);
  const [data, setData] = useState<Monthly | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Primero las cifras (rápido) y luego el texto de IA
    api.monthly(month, false)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
        if (!d.stats.episodes) return;
        setAiLoading(true);
        return api.monthly(month, true).then((full) => { if (!cancelled) setData(full); });
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => { if (!cancelled) { setLoading(false); setAiLoading(false); } });
    return () => { cancelled = true; };
  }, [month]);

  const s = data?.stats;
  const diff = s && s.previous_episodes ? Math.round(((s.episodes - s.previous_episodes) / s.previous_episodes) * 100) : null;
  const maxDay = s ? Math.max(1, ...s.by_weekday) : 1;

  return (
    <section className="panel monthly">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.35rem' }}>Resumen del mes</h2>
          <span className="muted small">Tus gustos de {monthLabel(month).toLowerCase()}, con un toque de IA</span>
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes">
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {error && <p className="error small">{error}</p>}
      {loading || !s ? <div className="skeleton" style={{ height: 160 }} /> : !s.episodes ? (
        <p className="muted" style={{ margin: 0 }}>No marcaste capítulos en {monthLabel(month).toLowerCase()}.</p>
      ) : (
        <>
          {aiLoading && !data?.ai && <div className="skeleton" style={{ height: 70 }} />}
          {data?.ai && (
            <div className="monthly-ai">
              <span className="ai-badge">✦ IA</span>
              <h3>{data.ai.headline}</h3>
              <p>{data.ai.summary}</p>
              {data.ai.fun_facts.length > 0 && <ul>{data.ai.fun_facts.map((f) => <li key={f}>{f}</li>)}</ul>}
            </div>
          )}
          <div className="stats" style={{ flex: 'none', maxWidth: 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <div className="stat"><strong>{s.episodes}</strong><span>Capítulos{diff !== null ? ` (${diff >= 0 ? '+' : ''}${diff}%)` : ''}</span></div>
            <div className="stat"><strong>{s.minutes ? formatDuration(s.minutes) : '—'}</strong><span>De anime</span></div>
            <div className="stat"><strong>{s.titles}</strong><span>Títulos</span></div>
            <div className="stat"><strong>{s.active_days}</strong><span>Días activos</span></div>
            <div className="stat"><strong>{s.longest_streak}</strong><span>Mejor racha</span></div>
            <div className="stat"><strong>{s.completed.length}</strong><span>Terminados</span></div>
          </div>
          <div className="stats-grid">
            <div>
              <h3 className="section-label">Géneros del mes</h3>
              <div className="chips">{s.top_genres.map((g) => <span key={g.name} className="chip on">{g.name} · {g.episodes}</span>)}</div>
              {s.top_studios.length > 0 && <p className="muted small">Estudios: {s.top_studios.map((x) => x.name).join(', ')}</p>}
            </div>
            <div>
              <h3 className="section-label">Qué día ves más</h3>
              <div className="week-bars" role="img" aria-label="Capítulos por día de la semana">
                {s.by_weekday.map((n, i) => (
                  <div key={i} className="wb"><div style={{ height: `${(n / maxDay) * 100}%` }} title={`${n}`} /><span>{DAYS[i]}</span></div>
                ))}
              </div>
            </div>
          </div>
          {s.top_titles.length > 0 && (
            <p className="small" style={{ margin: 0 }}>
              <strong>Lo que más viste:</strong> {s.top_titles.map((t) => `${t.title} (${t.episodes})`).join(' · ')}
            </p>
          )}
          <ShareCard filename={`zebanitracker-${month}.png`} label="Compartir mi mes"
            payload={() => ({
              kind: 'stats',
              name: username ?? undefined,
              title: data?.ai?.headline ?? `Mi ${monthLabel(month).toLowerCase()} en anime`,
              subtitle: monthLabel(month),
              numbers: [
                { value: String(s.episodes), label: 'capítulos' },
                { value: s.minutes ? `${Math.round(s.minutes / 60)} h` : String(s.titles), label: s.minutes ? 'de anime' : 'títulos' },
                { value: String(s.longest_streak), label: 'días de racha' },
              ],
              highlights: (data?.ai?.fun_facts ?? []).slice(0, 3),
              items: s.top_titles.slice(0, 5).map((t) => ({ title: t.title, cover_url: t.cover_url })),
            })} />
        </>
      )}
    </section>
  );
}
