'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AIRING_LABELS, AnimeStatus, api, BrowseFilters, CatalogAnime, currentSeason, FilterOptions, FORMAT_LABELS, MediaType, SEASON_LABELS, SORT_LABELS,
} from '@/lib/api';
import { MediaTabs } from '@/components/MediaTabs';
import { NaturalSearch } from '@/components/NaturalSearch';
import { SafeBoundary } from '@/components/SafeBoundary';

const FORMATS_BY_MEDIA: Record<MediaType, string[]> = {
  anime: ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'],
  manga: ['MANGA', 'ONE_SHOT'],
  novel: [],
};
const NOUN: Record<MediaType, string> = { anime: 'anime', manga: 'manga', novel: 'novela ligera' };
import { useAuth } from '@/components/AuthProvider';
import { Cover } from '@/components/Cover';
import { CheckIcon, SearchIcon, SeasonIcon, TagIcon } from '@/components/Icons';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 2 - 1960 }, (_, i) => CURRENT_YEAR + 1 - i);
const EMPTY: BrowseFilters = { search: '', genres: [], tags: [], formats: [] };

export default function ExplorePage() {
  const { session } = useAuth();
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [results, setResults] = useState<CatalogAnime[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Map<number, { id: string; status: string }>>(new Map());
  const [adding, setAdding] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [aiMode, setAiMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const media: MediaType = filters.media ?? 'anime';
  const isAnime = media === 'anime';
  const requestId = useRef(0);

  // /explore?season=FALL&year=2026 (enlace "estrenos de la temporada")
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const season = p.get('season') ?? undefined;
    const year = p.get('year') ? Number(p.get('year')) : undefined;
    const m = p.get('media') as MediaType | null;
    if (season || year) setFilters((f) => ({ ...f, season, year }));
    if (m === 'manga' || m === 'novel') setFilters((f) => ({ ...f, media: m }));
    if (p.get('ai')) setAiMode(true);
  }, []);

  const now = currentSeason();
  const isThisSeason = filters.season === now.season && filters.year === now.year;

  useEffect(() => {
    if (!session) return;
    api.catalogFilters().then(setOptions).catch(() => {});
    api.list().then((list) =>
      setMine(new Map(list.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, { id: a.id, status: a.status }]))),
    ).catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const id = ++requestId.current;
    const t = setTimeout(() => load(1, id), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, session]);

  async function load(p: number, id = ++requestId.current) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.browseCatalog({ ...filters, page: p });
      if (id !== requestId.current) return;
      setResults((prev) => (p === 1 ? r.results : [...prev, ...r.results]));
      setPage(r.page);
      setHasNext(r.hasNextPage);
      setTotal(r.total);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const set = <K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const toggleIn = (key: 'genres' | 'formats' | 'tags', value: string) =>
    setFilters((f) => {
      const list = f[key] ?? [];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });

  function addTag(name: string) {
    const tag = options?.tags.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (tag && !(filters.tags ?? []).includes(tag.name)) toggleIn('tags', tag.name);
    setTagInput('');
  }

  const activeCount = useMemo(
    () => [filters.search, filters.year, filters.season, filters.status].filter(Boolean).length +
      (filters.genres?.length ?? 0) + (filters.tags?.length ?? 0) + (filters.formats?.length ?? 0),
    [filters],
  );

  async function add(a: CatalogAnime, status: AnimeStatus) {
    setAdding(a.anilist_id);
    try {
      const created = await api.create({
        title: a.title, total_episodes: a.total_episodes, cover_url: a.cover_url, source_url: a.site_url,
        anilist_id: a.anilist_id, status, watched_episodes: 0, media_type: a.media_type ?? media,
        total_volumes: a.total_volumes ?? null,
      });
      setMine((m) => new Map(m).set(a.anilist_id, { id: created.id, status }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  }

  if (!session) return null;

  return (
    <main>
      <section className="explore-hero">
        <div className="explore-hero-inner">
          <div>
            <span className="eyebrow">Catálogo de AniList</span>
            <h1 style={{ marginTop: 8 }}>Encuentra tu próximo {NOUN[media]}</h1>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <MediaTabs value={media} label="Qué buscar"
              onChange={(v) => v !== 'all' && setFilters((f) => ({ ...f, media: v, formats: [], season: undefined, ...(v !== 'anime' ? { status: undefined } : {}) }))} />
            <div className="segmented" role="radiogroup" aria-label="Modo de búsqueda">
              <button role="radio" aria-checked={!aiMode} onClick={() => setAiMode(false)}><SearchIcon size={14} /> Filtros</button>
              <button role="radio" aria-checked={aiMode} onClick={() => setAiMode(true)}>✦ Buscar con IA</button>
            </div>
          </div>
          {aiMode ? (
            <SafeBoundary name="búsqueda con IA">
              <NaturalSearch media={media} mine={mine} adding={adding} onAdd={add} />
            </SafeBoundary>
          ) : (
          <>
          <label className="search xl">
            <SearchIcon size={20} />
            <span className="sr-only">Buscar por nombre</span>
            <input placeholder={isAnime ? 'Busca por nombre: Frieren, Dandadan…' : media === 'manga' ? 'Busca por nombre: Berserk, Chainsaw Man…' : 'Busca por nombre: Mushoku Tensei, Overlord…'}
              value={filters.search ?? ''} onChange={(e) => set('search', e.target.value)} />
          </label>
          <div className="inline-filters">
            {isAnime && <div className="segmented" role="radiogroup" aria-label="Temporada">
              {['', 'WINTER', 'SPRING', 'SUMMER', 'FALL'].map((s) => (
                <button key={s || 'all'} role="radio" aria-checked={(filters.season ?? '') === s} onClick={() => set('season', s)}>
                  <SeasonIcon season={s} />{s ? SEASON_LABELS[s] : 'Todas'}
                </button>
              ))}
            </div>}
            {isAnime && <button type="button" className="chip" aria-pressed={isThisSeason}
              onClick={() => setFilters((f) => isThisSeason ? { ...f, season: undefined, year: undefined } : { ...f, season: now.season, year: now.year })}>
              Esta temporada · {SEASON_LABELS[now.season]} {now.year}
            </button>}
            <label>Año
              <select value={filters.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Cualquiera</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>{isAnime ? 'Emisión' : 'Publicación'}
              <select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
                <option value="">Cualquiera</option>
                {Object.entries(AIRING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {activeCount > 0 && (
              <button className="link" style={{ fontWeight: 600, minHeight: 44 }} onClick={() => setFilters({ ...EMPTY, media: filters.media })}>
                Limpiar filtros ({activeCount})
              </button>
            )}
          </div>
          </>
          )}
        </div>
      </section>

      {!aiMode && (

      <div className="explore">
        <button type="button" className="btn filters-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Ocultar filtros' : `Formato, géneros y etiquetas${activeCount ? ` (${activeCount})` : ''}`}
        </button>
        <aside className={`filters ${showFilters ? 'open' : ''}`}>
          {FORMATS_BY_MEDIA[media].length > 0 && <fieldset className="chips">
            <legend className="section-label">Formato</legend>
            {FORMATS_BY_MEDIA[media].map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={!!filters.formats?.includes(v)} onClick={() => toggleIn('formats', v)}>{FORMAT_LABELS[v] ?? v}</button>
            ))}
          </fieldset>}

          <fieldset className="chips">
            <legend className="section-label">Géneros</legend>
            {!options && <span className="muted small">Cargando…</span>}
            {options?.genres.map((g) => (
              <button key={g} type="button" className="chip" aria-pressed={!!filters.genres?.includes(g)} onClick={() => toggleIn('genres', g)}>{g}</button>
            ))}
          </fieldset>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="section-label">Etiquetas</h2>
            <label className="search">
              <TagIcon size={15} />
              <span className="sr-only">Buscar etiqueta</span>
              <input list="tag-options" placeholder="Magic, Time Skip, Isekai…" value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  if (options?.tags.some((t) => t.name === e.target.value)) addTag(e.target.value);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} />
            </label>
            <datalist id="tag-options">
              {options?.tags.map((t) => <option key={t.name} value={t.name}>{t.category}</option>)}
            </datalist>
            {!!filters.tags?.length && (
              <div className="chips">
                {filters.tags.map((t) => (
                  <button key={t} type="button" className="chip on" onClick={() => toggleIn('tags', t)} aria-label={`Quitar etiqueta ${t}`}>{t} ✕</button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="explore-results">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="muted">
              {loading && results.length === 0 ? 'Buscando en AniList…' : <><strong style={{ color: 'var(--text)' }}>{total.toLocaleString('es')}</strong> resultados</>}
            </span>
            <label className="row muted small">Ordenar
              <select style={{ width: 'auto' }} value={filters.sort ?? ''} onChange={(e) => set('sort', e.target.value)}>
                <option value="">{filters.search ? 'Relevancia' : 'Popularidad'}</option>
                {Object.entries(SORT_LABELS).filter(([v]) => v !== 'SEARCH_MATCH' || filters.search)
                  .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="error">{error}</p>}

          <div className="grid">
            {results.map((a) => {
              const local = mine.get(a.anilist_id);
              const eps = a.total_episodes ?? a.aired_episodes;
              return (
                <article key={a.anilist_id} className="result">
                  <Cover src={a.cover_url} title={a.title}>
                    <Link href={`/explore/${a.anilist_id}`} className="cover-link" aria-label={`Ver ficha de ${a.title}`} />
                    {a.format && <span className="format">{FORMAT_LABELS[a.format] ?? a.format}</span>}
                    {a.airing_status === 'RELEASING' && <span className="live">EN EMISIÓN</span>}
                    {a.score && <span className="score">{a.score}%</span>}
                    <div className="reveal">
                      {local ? (
                        <Link href={`/animes/${local.id}`} className="done"><span className="row"><CheckIcon /> En tu lista</span></Link>
                      ) : (
                        <>
                          <button className="btn primary" disabled={adding === a.anilist_id} onClick={() => add(a, 'watching')}>Empezar a ver</button>
                          <button className="btn light" disabled={adding === a.anilist_id} onClick={() => add(a, 'plan_to_watch')}>+ Pendiente</button>
                        </>
                      )}
                    </div>
                  </Cover>
                  <div className="result-info">
                    <h3><Link href={`/explore/${a.anilist_id}`}>{a.title}</Link></h3>
                    <span className="muted small">
                      {[
                        a.season && a.year ? `${SEASON_LABELS[a.season]} ${a.year}` : a.year,
                        a.format === 'MOVIE' ? null : eps ? `${eps} caps.${a.total_episodes ? '' : ' emitidos'}` : null,
                        a.airing_status && a.airing_status !== 'RELEASING' ? AIRING_LABELS[a.airing_status] : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                    <div className="genre-list">
                      {a.genres.slice(0, 3).map((g) => (
                        <button key={g} className="genre" onClick={() => !filters.genres?.includes(g) && toggleIn('genres', g)}>{g}</button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && !error && results.length === 0 && <div className="empty">No hay resultados con esos filtros. Prueba quitando alguno.</div>}
          {hasNext && (
            <div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
              <button className="btn" disabled={loading} onClick={() => load(page + 1)}>{loading ? 'Cargando…' : 'Cargar más'}</button>
            </div>
          )}
        </section>
      </div>
      )}
    </main>
  );
}
