import type { SupabaseClient } from '@supabase/supabase-js';

export interface MonthlyStats {
  month: string;              // YYYY-MM
  episodes: number;
  minutes: number;
  titles: number;
  active_days: number;
  best_day: { date: string; episodes: number } | null;
  longest_streak: number;
  top_genres: { name: string; episodes: number }[];
  top_studios: { name: string; episodes: number }[];
  top_titles: { id: string; title: string; cover_url: string | null; episodes: number }[];
  completed: { title: string; score: number | null }[];
  started: number;
  by_weekday: number[];       // lunes..domingo
  night_owl: number;          // capítulos marcados entre 0 y 5 h (hora de Bogotá por defecto)
  previous_episodes: number;  // mes anterior, para comparar
}

interface EventRow { anime_id: string; episode: number; watched_at: string }
interface AnimeRow {
  id: string; title: string; cover_url: string | null; genres: string[]; studios: string[]; duration: number | null;
  media_type: string; status: string; completed_at: string | null; score: number | null; created_at: string;
}

/** Inicio y fin (exclusivo) del mes en UTC, desplazados por la zona horaria (minutos respecto a UTC). */
function bounds(month: string, tzOffsetMin: number) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - tzOffsetMin * 60_000);
  const end = new Date(Date.UTC(y, m, 1) - tzOffsetMin * 60_000);
  return { start, end };
}

export function previousMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Estadísticas reales del mes a partir del historial de capítulos.
 * `db` puede ser el cliente del usuario (RLS) o el de service role con `userId` para filtrar.
 */
export async function monthlyStats(db: SupabaseClient, month: string, opts: { userId?: string; tzOffsetMin?: number } = {}): Promise<MonthlyStats> {
  const tz = opts.tzOffsetMin ?? -300; // America/Bogota
  const { start, end } = bounds(month, tz);
  const prev = bounds(previousMonth(month), tz);

  let ev = db.from('watch_events').select('anime_id, episode, watched_at')
    .gte('watched_at', start.toISOString()).lt('watched_at', end.toISOString()).limit(10000);
  let prevEv = db.from('watch_events').select('anime_id', { count: 'exact', head: true })
    .gte('watched_at', prev.start.toISOString()).lt('watched_at', prev.end.toISOString());
  let an = db.from('animes').select('id, title, cover_url, genres, studios, duration, media_type, status, completed_at, score, created_at');
  if (opts.userId) {
    ev = ev.eq('user_id', opts.userId);
    prevEv = prevEv.eq('user_id', opts.userId);
    an = an.eq('user_id', opts.userId);
  }
  const [{ data: evData }, { count: prevCount }, { data: anData }] = await Promise.all([ev, prevEv, an]);
  const events = (evData ?? []) as EventRow[];
  const animes = new Map(((anData ?? []) as AnimeRow[]).map((a) => [a.id, a]));

  const local = (iso: string) => new Date(new Date(iso).getTime() + tz * 60_000);
  const perDay = new Map<string, number>();
  const perTitle = new Map<string, number>();
  const genres = new Map<string, number>();
  const studios = new Map<string, number>();
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  let minutes = 0, night = 0;
  for (const e of events) {
    const d = local(e.watched_at);
    const day = d.toISOString().slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    perTitle.set(e.anime_id, (perTitle.get(e.anime_id) ?? 0) + 1);
    weekday[(d.getUTCDay() + 6) % 7]++;
    if (d.getUTCHours() < 5) night++;
    const a = animes.get(e.anime_id);
    if (!a) continue;
    minutes += a.media_type === 'anime' ? a.duration ?? 24 : 0;
    a.genres.forEach((g) => genres.set(g, (genres.get(g) ?? 0) + 1));
    a.studios.forEach((s) => studios.set(s, (studios.get(s) ?? 0) + 1));
  }

  const days = [...perDay.keys()].sort();
  let longest = 0, run = 0, prevDay: number | null = null;
  for (const d of days) {
    const t = Date.parse(d);
    run = prevDay !== null && t - prevDay === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prevDay = t;
  }
  const best = [...perDay].sort((a, b) => b[1] - a[1])[0];
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, episodes]) => ({ name, episodes }));
  const inMonth = (iso: string | null) => !!iso && new Date(iso) >= start && new Date(iso) < end;

  return {
    month,
    episodes: events.length,
    minutes,
    titles: perTitle.size,
    active_days: perDay.size,
    best_day: best ? { date: best[0], episodes: best[1] } : null,
    longest_streak: longest,
    top_genres: top(genres, 5),
    top_studios: top(studios, 3),
    top_titles: [...perTitle].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, episodes]) => {
      const a = animes.get(id);
      return { id, title: a?.title ?? '¿?', cover_url: a?.cover_url ?? null, episodes };
    }),
    completed: [...animes.values()].filter((a) => a.status === 'completed' && inMonth(a.completed_at)).map((a) => ({ title: a.title, score: a.score })),
    started: [...animes.values()].filter((a) => inMonth(a.created_at)).length,
    by_weekday: weekday,
    night_owl: night,
    previous_episodes: prevCount ?? 0,
  };
}

/** Texto compacto para la IA (solo cifras y títulos reales). */
export function describeMonth(s: MonthlyStats): string {
  const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const fav = s.by_weekday.indexOf(Math.max(...s.by_weekday));
  return [
    `Capítulos vistos: ${s.episodes} (mes anterior: ${s.previous_episodes})`,
    `Tiempo aproximado: ${Math.round(s.minutes / 60)} horas`,
    `Títulos distintos: ${s.titles}; días con actividad: ${s.active_days}; racha más larga: ${s.longest_streak} días`,
    s.best_day ? `Día récord: ${s.best_day.date} con ${s.best_day.episodes} capítulos` : '',
    `Géneros más vistos: ${s.top_genres.map((g) => `${g.name} (${g.episodes})`).join(', ') || 'ninguno'}`,
    `Estudios más vistos: ${s.top_studios.map((g) => `${g.name} (${g.episodes})`).join(', ') || 'ninguno'}`,
    `Lo que más vio: ${s.top_titles.map((t) => `${t.title} (${t.episodes})`).join(', ') || 'nada'}`,
    `Terminados: ${s.completed.map((c) => `${c.title}${c.score ? ` ${c.score}/10` : ''}`).join(', ') || 'ninguno'}`,
    `Agregados a la lista este mes: ${s.started}`,
    s.episodes ? `Día de la semana favorito: ${days[fav]}` : '',
    `Capítulos de madrugada (0-5 h): ${s.night_owl}`,
  ].filter(Boolean).join('\n');
}
