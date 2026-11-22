'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AIRING_LABELS, api, Anime, AnimeDetails, AnimeStatus, FORMAT_LABELS, formatDate, RELATION_LABELS, relativeTime,
  SEASON_LABELS, SOURCE_LABELS, STATUS_LABELS,
} from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { BackIcon, CheckIcon, PlayIcon, PlusIcon } from '@/components/Icons';
import { WatchLinks } from '@/components/WatchLinks';
import { SeasonsPanel } from '@/components/SeasonsPanel';
import { Synopsis } from '@/components/Synopsis';
import { SafeBoundary } from '@/components/SafeBoundary';

export default function CatalogDetailPage() {
  const { anilistId } = useParams<{ anilistId: string }>();
  const id = Number(anilistId);
  const { session } = useAuth();
  const [anime, setAnime] = useState<AnimeDetails | null>(null);
  const [mine, setMine] = useState<Anime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    setAnime(null);
    setError(null);
    api.catalogDetails(id).then(setAnime).catch((e) => setError(e.message));
    api.list().then((list) => setMine(list.find((a) => a.anilist_id === id) ?? null)).catch(() => {});
  }, [id, session]);

  async function add(status: AnimeStatus) {
    if (!anime) return;
    setBusy(true);
    try {
      setMine(await api.create({
        title: anime.title, total_episodes: anime.total_episodes, cover_url: anime.cover_url,
        source_url: anime.site_url, anilist_id: anime.anilist_id, status, watched_episodes: 0,
        media_type: anime.media_type ?? 'anime', total_volumes: anime.total_volumes ?? null,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !anime) return <main className="container"><p className="error">{error}</p></main>;
  if (!anime) return <main className="container"><p className="muted">Cargando ficha…</p></main>;

  const eps = anime.total_episodes ?? anime.aired_episodes;
  const airingNext = anime.airing_status === 'RELEASING' && anime.next_episode_at;
  const tags = [
    anime.format && (FORMAT_LABELS[anime.format] ?? anime.format),
    anime.season && anime.year ? `${SEASON_LABELS[anime.season]} ${anime.year}` : anime.year,
    anime.format !== 'MOVIE' && eps ? `${eps} caps.${anime.total_episodes ? '' : ' emitidos'}` : null,
    anime.airing_status && AIRING_LABELS[anime.airing_status],
  ].filter(Boolean) as (string | number)[];

  const info: [string, string | null][] = [
    ['Formato', anime.format ? FORMAT_LABELS[anime.format] ?? anime.format : null],
    ['Episodios', anime.total_episodes ? String(anime.total_episodes) : anime.aired_episodes ? `${anime.aired_episodes} emitidos` : 'Por confirmar'],
    ['Duración', anime.duration ? `${anime.duration} min por capítulo` : null],
    ['Estado', anime.airing_status ? AIRING_LABELS[anime.airing_status] : null],
    ['Temporada', anime.season && anime.year ? `${SEASON_LABELS[anime.season]} ${anime.year}` : anime.year ? String(anime.year) : null],
    ['Emisión', [formatDate(anime.start_date), formatDate(anime.end_date)].filter(Boolean).join(' – ') || null],
    ['Estudio', anime.studios.join(', ') || null],
    ['Origen', anime.source ? SOURCE_LABELS[anime.source] ?? anime.source : null],
    ['Puntuación', anime.score ? `${anime.score}% en AniList` : null],
    ['Popularidad', anime.popularity ? `${anime.popularity.toLocaleString('es')} usuarios` : null],
  ];

  return (
    <main>
      <section className="hero">
        {(anime.banner_url || anime.cover_url) && (
          <div className="hero-bg" style={{ backgroundImage: `url(${anime.banner_url ?? anime.cover_url})`, filter: anime.banner_url ? 'blur(6px)' : undefined }} />
        )}
        <div className="hero-inner">
          <Link href="/explore" className="back"><BackIcon /> Volver a explorar</Link>
          <div className="hero-main">
            <Cover src={anime.cover_large_url ?? anime.cover_url} title={anime.title} />
            <div className="hero-text">
              <div className="tags">
                {tags.map((t) => <span key={String(t)} className="tag">{t}</span>)}
                {airingNext && <span className="tag hot">Cap. {(anime.aired_episodes ?? 0) + 1} {relativeTime(anime.next_episode_at!)}</span>}
              </div>
              <h1>{anime.title}</h1>
              {anime.title_romaji && anime.title_romaji !== anime.title && <p className="hero-sub">{anime.title_romaji}</p>}
              <div className="row" style={{ gap: 10, marginTop: 6 }}>
                {mine ? (
                  <Link href={`/animes/${mine.id}`} className="btn primary lg">
                    <CheckIcon /> En tu lista · {STATUS_LABELS[mine.status]} · cap. {mine.watched_episodes}
                  </Link>
                ) : (
                  <>
                    <button className="btn primary lg" disabled={busy} onClick={() => add('watching')}><PlayIcon /> Empezar a ver</button>
                    <button className="btn glass lg" disabled={busy} onClick={() => add('plan_to_watch')}><PlusIcon /> Pendiente</button>
                  </>
                )}
                {anime.trailer_url && <a href={anime.trailer_url} target="_blank" rel="noreferrer" className="btn glass lg">Tráiler ↗</a>}
                <a href={anime.site_url} target="_blank" rel="noreferrer" className="btn glass lg">AniList ↗</a>
              </div>
              {(anime.media_type ?? 'anime') === 'anime' && <WatchLinks variant="hero" max={eps}
                anime={{ title: anime.title, title_romaji: anime.title_romaji, source_url: mine?.source_url, last_episode_url: mine?.last_episode_url }}
                episode={Math.min((mine?.watched_episodes ?? 0) + 1, eps ?? Infinity)} />}
              {error && <p className="error small" style={{ margin: 0 }}>{error}</p>}
            </div>
          </div>
        </div>
      </section>

      <div className="detail">
        <div className="detail-main">
          <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: '1.35rem' }}>Sinopsis</h2>
            {anime.description
              ? <SafeBoundary name="sinopsis" fallback={<p className="synopsis">{anime.description}</p>}><Synopsis anilistId={anime.anilist_id} original={anime.description} /></SafeBoundary>
              : <p className="muted" style={{ margin: 0 }}>AniList aún no tiene sinopsis para esta obra.</p>}
          </section>

          {(anime.genres.length > 0 || anime.tags.length > 0) && (
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Géneros y etiquetas</h2>
              <div className="genre-list" style={{ gap: 8 }}>
                {anime.genres.map((g) => <span key={g} className="chip on">{g}</span>)}
                {anime.tags.map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
            </section>
          )}

          {(anime.media_type ?? 'anime') === 'anime' && <SeasonsPanel key={anime.anilist_id} currentAnilistId={anime.anilist_id}
            onListChange={(added) => { const me = added.find((a) => a.anilist_id === anime.anilist_id); if (me) setMine(me); }} />}

          {anime.relations.length > 0 && (
            <section className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 className="section-label">Relacionados</h2>
              <div className="relations">
                {anime.relations.map((r) => (
                  <Link key={r.anilist_id} href={`/explore/${r.anilist_id}`} className="relation">
                    <Cover src={r.cover_url} title={r.title} />
                    <span className="relation-type">{RELATION_LABELS[r.relation] ?? r.relation}</span>
                    <strong>{r.title}</strong>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="detail-side">
          <section className="panel">
            <h2 className="section-label" style={{ marginBottom: 12 }}>Información</h2>
            <dl className="info-list">
              {info.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
