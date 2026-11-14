'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, Anime, currentSeason, STATUS_LABELS } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { dayKey } from '@/lib/activity';

/** Calendario de estrenos de los próximos 7 días para lo que sigues. */
export default function CalendarPage() {
  const { session } = useAuth();
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api.syncEpisodes().catch(() => null)
      .then(() => api.list())
      .then(setAnimes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  const following = useMemo(
    () => animes.filter((a) => ['watching', 'plan_to_watch', 'on_hold'].includes(a.status)),
    [animes],
  );

  const days = useMemo(() => {
    const out: { key: string; date: Date; items: Anime[] }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      out.push({ key: dayKey(date), date, items: [] });
    }
    for (const a of following) {
      if (!a.next_episode_at) continue;
      const k = dayKey(new Date(a.next_episode_at));
      out.find((d) => d.key === k)?.items.push(a);
    }
    for (const d of out) d.items.sort((a, b) => a.next_episode_at!.localeCompare(b.next_episode_at!));
    return out;
  }, [following]);

  // Ya salió y no lo has visto
  const pending = following.filter((a) => a.status === 'watching' && a.airing_status === 'RELEASING' && a.aired_episodes !== null && a.aired_episodes > a.watched_episodes);
  const later = following.filter((a) => a.next_episode_at && new Date(a.next_episode_at).getTime() > days[6].date.getTime() + 86_400_000);
  const todayKey = dayKey(new Date());

  if (!session) return null;

  return (
    <main className="container stack">
      <div>
        <span className="eyebrow">Calendario</span>
        <h1 style={{ marginTop: 8 }}>Esta semana</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Próximos capítulos de lo que estás viendo, tienes pendiente o en pausa. Horas en tu zona horaria.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">Cargando…</p> : (
        <>
          {pending.length > 0 && (
            <section>
              <div className="section-head"><h2>Ya disponibles para ti</h2><span className="muted small">Salieron y aún no los marcas</span></div>
              <div className="rail">
                {pending.map((a) => (
                  <Link key={a.id} href={`/animes/${a.id}`} className="relation">
                    <Cover src={a.cover_url} title={a.title} />
                    <span className="relation-type">{a.aired_episodes! - a.watched_episodes} cap. por ver</span>
                    <strong>{a.title}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="week">
              {days.map((d) => (
                <div key={d.key} className={`day ${d.key === todayKey ? 'today' : ''}`}>
                  <h3>
                    {d.key === todayKey ? 'Hoy' : d.date.toLocaleDateString('es', { weekday: 'long' })}
                    <strong>{d.date.toLocaleDateString('es', { day: 'numeric', month: 'short' })}</strong>
                  </h3>
                  {d.items.length === 0 && <span className="muted small">Sin estrenos</span>}
                  {d.items.map((a) => (
                    <Link key={a.id} href={`/animes/${a.id}`} className="slot">
                      <Cover src={a.cover_url} title={a.title} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <strong>{a.title}</strong>
                        <span>
                          Cap. {(a.aired_episodes ?? 0) + 1} · {new Date(a.next_episode_at!).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {later.length > 0 && (
            <section className="panel">
              <h2 className="section-label" style={{ marginBottom: 10 }}>Más adelante</h2>
              <dl className="info-list">
                {later.map((a) => (
                  <div key={a.id}>
                    <dt><Link href={`/animes/${a.id}`}>{a.title}</Link> · {STATUS_LABELS[a.status]}</dt>
                    <dd>{new Date(a.next_episode_at!).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!pending.length && days.every((d) => !d.items.length) && !later.length && (
            <div className="empty">
              No hay estrenos próximos en tu lista. Los animes en emisión que agregues desde AniList aparecerán aquí.
              <div className="row"><Link href={`/explore?season=${currentSeason().season}&year=${currentSeason().year}`} className="btn primary">Ver estrenos de la temporada</Link></div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
