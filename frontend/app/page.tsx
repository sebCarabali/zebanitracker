'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, Anime, AnimeStatus, currentSeason, Discover, formatDuration, MediaType, MINUTES_PER_EPISODE, remainingMinutes, SEASON_LABELS, WatchEvent } from '@/lib/api';
import { MediaTabs } from '@/components/MediaTabs';
import { StaleReminders } from '@/components/StaleReminders';
import { useAuth } from '@/components/AuthProvider';
import { AnimeCard, ContinueCard, SeasonGroup } from '@/components/AnimeCard';
import { Cover } from '@/components/Cover';
import { AiRecommendations } from '@/components/AiRecommendations';
import { SafeBoundary } from '@/components/SafeBoundary';
import { SearchIcon } from '@/components/Icons';
import { streaks } from '@/lib/activity';

type Sort = 'recent' | 'title' | 'progress' | 'score' | 'next';
const SORTS: [Sort, string][] = [
  ['recent', 'Visto recientemente'], ['title', 'Título (A-Z)'], ['progress', 'Progreso'], ['score', 'Mi puntuación'], ['next', 'Próximo estreno'],
];
const CACHE_KEY = 'zt-list-cache';

type Tab = 'all' | 'fav' | AnimeStatus;
const TABS: [Tab, string][] = [
  ['all', 'Todos'], ['watching', 'Viendo'], ['completed', 'Completados'], ['plan_to_watch', 'Pendientes'],
  ['on_hold', 'En pausa'], ['dropped', 'Abandonados'], ['fav', 'Favoritos'],
];

function greetingName(email?: string) {
  const raw = (email ?? '').split('@')[0].split(/[._-]/)[0];
  return raw ? raw[0].toUpperCase() + raw.slice(1) : '';
}

export default function HomePage() {
  const { session } = useAuth();
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [grouped, setGrouped] = useState(false);
  const [offline, setOffline] = useState(false);
  const [discover, setDiscover] = useState<Discover | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [media, setMedia] = useState<MediaType | 'all'>('all');
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tag');
      if (t) setTag(t);
      const m = localStorage.getItem('zt-media') as MediaType | 'all' | null; if (m) setMedia(m);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem('zt-sort') as Sort | null; if (s) setSort(s);
      setGrouped(localStorage.getItem('zt-group') === '1');
    } catch {}
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api.list()
      .then((data) => {
        if (cancelled) return;
        setAnimes(data);
        setOffline(false);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch((e) => {
        if (cancelled) return;
        // Sin conexión: muestra la última copia guardada
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) { setAnimes(JSON.parse(cached)); setOffline(true); return; }
        } catch {}
        setError(e.message);
      })
      .finally(() => !cancelled && setLoading(false));

    api.discover().then((d) => !cancelled && setDiscover(d)).catch(() => {});
    api.activity(120).then((e) => !cancelled && setEvents(e)).catch(() => {});

    // Completa capítulos/emisión desde AniList en segundo plano (el servidor solo revisa lo desactualizado)
    api.syncEpisodes()
      .then((r) => (r.updated > 0 ? api.list() : null))
      .then((data) => { if (data && !cancelled) setAnimes(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  const replace = (a: Anime) => setAnimes((list) => list.map((x) => (x.id === a.id ? a : x)));

  const ofMedia = useMemo(() => animes.filter((a) => media === 'all' || (a.media_type ?? 'anime') === media), [animes, media]);
  const mediaCounts = useMemo(() => {
    const c: Partial<Record<MediaType | 'all', number>> = { all: animes.length };
    for (const a of animes) c[a.media_type ?? 'anime'] = (c[a.media_type ?? 'anime'] ?? 0) + 1;
    return c;
  }, [animes]);
  const allTags = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of ofMedia) for (const t of a.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1]);
  }, [ofMedia]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ofMedia.length, fav: ofMedia.filter((a) => a.is_favorite).length };
    for (const a of ofMedia) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [ofMedia]);

  const continueList = useMemo(
    () => animes
      .filter((a) => a.status === 'watching')
      .sort((a, b) => (b.last_watched_at ?? b.updated_at).localeCompare(a.last_watched_at ?? a.updated_at))
      .slice(0, 3),
    [animes],
  );

  const library = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pct = (a: Anime) => { const t = a.total_episodes ?? a.aired_episodes; return t ? a.watched_episodes / t : 0; };
    const cmp: Record<Sort, (a: Anime, b: Anime) => number> = {
      recent: (a, b) => (b.last_watched_at ?? b.updated_at).localeCompare(a.last_watched_at ?? a.updated_at),
      title: (a, b) => a.title.localeCompare(b.title, 'es'),
      progress: (a, b) => pct(b) - pct(a),
      score: (a, b) => (b.score ?? 0) - (a.score ?? 0),
      next: (a, b) => (a.next_episode_at ?? '9999').localeCompare(b.next_episode_at ?? '9999'),
    };
    return ofMedia
      .filter((a) => !tag || (a.tags ?? []).includes(tag))
      .filter((a) => tab === 'all' || (tab === 'fav' ? a.is_favorite : a.status === tab))
      .filter((a) => !q || a.title.toLowerCase().includes(q))
      .sort(cmp[sort]);
  }, [ofMedia, tab, query, sort, tag]);

  // Agrupar temporadas: una tarjeta por franquicia con el avance de toda la serie
  const cards = useMemo((): { anime: Anime; group?: SeasonGroup }[] => {
    if (!grouped) return library.map((anime) => ({ anime }));
    const keyOf = (a: Anime) => (a.franchise_id ? `f${a.franchise_id}` : a.id);
    const all = new Map<string, Anime[]>();
    for (const a of animes) all.set(keyOf(a), [...(all.get(keyOf(a)) ?? []), a]);
    const seen = new Set<string>();
    const out: { anime: Anime; group?: SeasonGroup }[] = [];
    for (const a of library) {
      const k = keyOf(a);
      if (seen.has(k)) continue;
      seen.add(k);
      const members = all.get(k)!;
      if (members.length < 2) { out.push({ anime: a }); continue; }
      const inLib = library.filter((x) => keyOf(x) === k);
      const bySeason = (x: Anime, y: Anime) => (x.season_number ?? 99) - (y.season_number ?? 99);
      // Representante: la que estás viendo; si no, la primera sin terminar; si no, la última
      const rep = inLib.find((x) => x.status === 'watching')
        ?? [...inLib].sort(bySeason).find((x) => x.status !== 'completed')
        ?? [...inLib].sort(bySeason).at(-1)!;
      const totals = members.map((x) => x.total_episodes ?? x.aired_episodes);
      out.push({
        anime: rep,
        group: {
          count: members.length,
          completed: members.filter((x) => x.status === 'completed').length,
          watched: members.reduce((n, x) => n + x.watched_episodes, 0),
          total: totals.every((t) => t !== null) ? totals.reduce((n, t) => n + t!, 0) : null,
        },
      });
    }
    return out;
  }, [grouped, library, animes]);

  const streak = useMemo(() => streaks(events).current, [events]);
  const season = currentSeason();

  async function addFromCatalog(m: Discover['recommendations'][number]['media'], status: AnimeStatus) {
    try {
      const created = await api.create({
        title: m.title, total_episodes: m.total_episodes, cover_url: m.cover_url, source_url: m.site_url,
        anilist_id: m.anilist_id, status, watched_episodes: 0,
      });
      setAnimes((l) => [created, ...l]);
      setDiscover((d) => d && {
        recommendations: d.recommendations.filter((r) => r.media.anilist_id !== m.anilist_id),
        sequels: d.sequels.filter((x) => x.media.anilist_id !== m.anilist_id),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const animeOnly = animes.filter((a) => (a.media_type ?? 'anime') === 'anime');
  const episodes = animeOnly.reduce((n, a) => n + a.watched_episodes, 0);
  const minutes = animeOnly.reduce((n, a) => n + a.watched_episodes * (a.duration ?? MINUTES_PER_EPISODE), 0);
  const chapters = animes.filter((a) => a.media_type && a.media_type !== 'anime').reduce((n, a) => n + a.watched_episodes, 0);
  const plan = animes.filter((a) => a.status === 'plan_to_watch');
  const planMinutes = plan.reduce((n, a) => n + (remainingMinutes(a) ?? 0), 0);
  const stats = [
    { value: animes.length, label: 'En tu lista' },
    { value: counts.watching ?? 0, label: 'En curso' },
    chapters ? { value: chapters, label: 'Caps. de manga leídos' } : { value: episodes, label: 'Capítulos vistos' },
    { value: `${Math.round(minutes / 60)} h`, label: 'Horas vistas' },
  ];

  if (!session) return null;
  const name = greetingName(session.user.email);
  const rawDate = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  return (
    <main className="container stack">
      <section className="hello">
        <div>
          <span className="muted small">{today}</span>
          <h1>Hola{name ? `, ${name}` : ''}</h1>
          {streak > 1 && <span className="streak" style={{ marginTop: 10 }}>Racha de {streak} días</span>}
          <p>
            {loading ? 'Cargando tu lista…'
              : animes.length === 0 ? 'Tu lista está vacía. Empieza explorando o importando de AniList.'
              : `Tienes ${counts.watching ?? 0} animes en curso. Sigue donde lo dejaste.`}
          </p>
        </div>
        <div className="stats">
          {stats.map((s) => (
            <div key={s.label} className="stat"><strong>{s.value}</strong><span>{s.label}</span></div>
          ))}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {!loading && !offline && <SafeBoundary name="recordatorios"><StaleReminders onChange={replace} /></SafeBoundary>}
      {offline && <div className="banner">Sin conexión: estás viendo la última copia guardada de tu lista.</div>}

      {continueList.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Continúa viendo</h2>
            <span className="muted small">Marca el capítulo con un clic</span>
          </div>
          <div className="continue-grid">
            {continueList.map((a) => <ContinueCard key={a.id} anime={a} onChange={replace} />)}
          </div>
        </section>
      )}

      {!loading && !offline && (
        <SafeBoundary name="IA">
          <AiRecommendations hasAnimes={animes.length > 0} onAdded={(a) => setAnimes((l) => [a, ...l])} />
        </SafeBoundary>
      )}

      {discover && discover.sequels.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Secuelas pendientes</h2>
            <span className="muted small">Terminaste la temporada anterior</span>
          </div>
          <div className="rail">
            {discover.sequels.map((s) => (
              <MiniCard key={s.media.anilist_id} media={s.media} note={`Después de ${s.after}`} onAdd={addFromCatalog} />
            ))}
          </div>
        </section>
      )}

      {discover && discover.recommendations.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Similares a lo que ves</h2>
            <Link href={`/explore?season=${season.season}&year=${season.year}`} className="small">
              Ver estrenos de {SEASON_LABELS[season.season].toLowerCase()} {season.year} →
            </Link>
          </div>
          <div className="rail">
            {discover.recommendations.map((r) => (
              <MiniCard key={r.media.anilist_id} media={r.media} note={`Porque viste ${r.because[0]}`} onAdd={addFromCatalog} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Mi biblioteca</h2>
          <label className="search" style={{ flex: '0 1 320px' }}>
            <SearchIcon />
            <span className="sr-only">Buscar en mi lista</span>
            <input placeholder="Buscar en mi lista…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="toolbar-row">
          {((mediaCounts.manga ?? 0) + (mediaCounts.novel ?? 0) > 0 || media !== 'all') && (
            <MediaTabs allowAll value={media} counts={mediaCounts} label="Tipo de obra"
              onChange={(v) => { setMedia(v); try { localStorage.setItem('zt-media', v); } catch {} }} />
          )}
        </div>
        {allTags.length > 0 && (
          <div className="chips" style={{ marginBottom: 12 }} aria-label="Mis listas">
            <button className={`chip ${!tag ? 'on' : ''}`} onClick={() => setTag(null)}>Todas</button>
            {allTags.map(([t, n]) => (
              <button key={t} className={`chip ${tag === t ? 'on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'plan_to_watch' && plan.length > 0 && (
          <div className="banner" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {plan.length} pendientes{planMinutes ? ` · unas ${formatDuration(planMinutes)} de anime` : ''}.
            <Link href="/plan">Ordenarlos y elegir qué ver hoy →</Link>
          </div>
        )}
        <div className="toolbar-row">
          <div className="tabs" role="tablist" aria-label="Filtrar por estado">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}<span className="badge-count">{counts[id] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="check small" style={{ minHeight: 40 }}>
            <input type="checkbox" checked={grouped}
              onChange={(e) => { setGrouped(e.target.checked); try { localStorage.setItem('zt-group', e.target.checked ? '1' : '0'); } catch {} }} />
            Agrupar temporadas
          </label>
          <label className="row muted small">Ordenar
            <select value={sort} onChange={(e) => { const v = e.target.value as Sort; setSort(v); try { localStorage.setItem('zt-sort', v); } catch {} }}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : library.length === 0 ? (
          <div className="empty">
            <p>{animes.length ? 'Nada por aquí con este filtro.' : 'Aún no tienes animes.'}</p>
            {!animes.length && (
              <div className="row">
                <Link href="/explore" className="btn primary">Explorar el catálogo</Link>
                <Link href="/import" className="btn">Importar de AniList</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="grid">
            {cards.map(({ anime: a, group }) => <AnimeCard key={a.id} anime={a} group={group} onChange={replace} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function MiniCard({ media, note, onAdd }: {
  media: Discover['recommendations'][number]['media'];
  note: string;
  onAdd: (m: Discover['recommendations'][number]['media'], status: AnimeStatus) => void;
}) {
  return (
    <article className="result">
      <Cover src={media.cover_url} title={media.title}>
        <Link href={`/explore/${media.anilist_id}`} className="cover-link" aria-label={`Ver ficha de ${media.title}`} />
        <div className="reveal">
          <button className="btn primary" onClick={() => onAdd(media, 'watching')}>Empezar a ver</button>
          <button className="btn light" onClick={() => onAdd(media, 'plan_to_watch')}>+ Pendiente</button>
        </div>
      </Cover>
      <div className="result-info">
        <h3><Link href={`/explore/${media.anilist_id}`}>{media.title}</Link></h3>
        <span className="because">{note}</span>
      </div>
    </article>
  );
}
