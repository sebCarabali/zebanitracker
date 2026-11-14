import type { WatchEvent } from './api';

/** Fecha local YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Capítulos por día. */
export function perDay(events: WatchEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    const k = dayKey(new Date(e.watched_at));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Racha actual (cuenta hoy o, si hoy aún no ves nada, desde ayer) y la más larga. */
export function streaks(events: WatchEvent[]): { current: number; longest: number } {
  const days = perDay(events);
  if (!days.size) return { current: 0, longest: 0 };
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(d))) { current++; d.setDate(d.getDate() - 1); }

  const sorted = [...days.keys()].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T12:00:00');
    prev.setDate(prev.getDate() + 1);
    run = dayKey(prev) === sorted[i] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}
