'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AIRING_LABELS, AnimeStatus, api, BrowseFilters, CatalogAnime, FilterOptions, FORMAT_LABELS, SEASON_LABELS,
  SORT_LABELS, STATUS_LABELS,
} from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

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
  const [mine, setMine] = useState<Map<number, string>>(new Map()); // anilist_id → id local
  const [tagInput, setTagInput] = useState('');
  const requestId = useRef(0);

  // Opciones de filtros y animes que ya tengo
  useEffect(() => {
    if (!session) return;
    api.catalogFilters().then(setOptions).catch(() => {});
    api.list().then((list) =>
      setMine(new Map(list.filter((a) => a.anilist_id).map((a) => [a.anilist_id!, a.id]))),
    ).catch(() => {});
  }, [session]);

  // Buscar cuando cambian los filtros (con debounce)
  useEffect(() => {
    if (!session) return;
    const id = ++requestId.current;
    const t = setTimeout(() => load(1, id), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, session]);

  async function load(p: number, id = ++requestId.current) {
    setLoading(true);
    setError(null);
    try {
      const r = await api.browseCatalog({ ...filters, page: p });
      if (id !== requestId.current) return; // llegó una respuesta vieja
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
    () =>
      [filters.search, filters.year, filters.season, filters.status].filter(Boolean).length +
      (filters.genres?.length ?? 0) + (filters.tags?.length ?? 0) + (filters.formats?.length ?? 0),
    [filters],
  );

  async function add(a: CatalogAnime, status: AnimeStatus) {
    try {
      const created = await api.create({
        title: a.title,
        total_episodes: a.total_episodes,
        cover_url: a.cover_url,
        source_url: a.site_url,
        anilist_id: a.anilist_id,
        status,
        watched_episodes: 0,
      });
      setMine((m) => new Map(m).set(a.anilist_id, created.id));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (!session) return null;

  return (
    <div className="explore">
      <aside className="filters">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Filtros</h2>
          {activeCount > 0 && <button className="link small" onClick={() => setFilters(EMPTY)}>Limpiar ({activeCount})</button>}
        </div>

        <label>Buscar
          <input placeholder="Nombre del anime…" value={filters.search ?? ''} onChange={(e) => set('search', e.target.value)} />
        </label>

        <div className="grid2">
          <label>Año
            <select value={filters.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Cualquiera</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>Temporada
            <select value={filters.season ?? ''} onChange={(e) => set('season', e.target.value)}>
              <option value="">Cualquiera</option>
              {Object.entries(SEASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="grid2">
          <label>Estado de emisión
            <select value={filters.status ?? ''} onChange={(e) => set('status', e.target.value)}>
              <option value="">Cualquiera</option>
              {Object.entries(AIRING_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Ordenar por
            <select value={filters.sort ?? ''} onChange={(e) => set('sort', e.target.value)}>
              <option value="">{filters.search ? 'Relevancia' : 'Popularidad'}</option>
              {Object.entries(SORT_LABELS)
                .filter(([v]) => v !== 'SEARCH_MATCH' || filters.search)
                .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="chips">
          <legend className="muted small">Formato</legend>
          {Object.entries(FORMAT_LABELS).map(([v, l]) => (
            <button key={v} type="button" className={`chip ${filters.formats?.includes(v) ? 'on' : ''}`} onClick={() => toggleIn('formats', v)}>
              {l}
            </button>
          ))}
        </fieldset>

        <fieldset className="chips">
          <legend className="muted small">Géneros</legend>
          {!options && <span className="muted small">Cargando…</span>}
          {options?.genres.map((g) => (
            <button key={g} type="button" className={`chip ${filters.genres?.includes(g) ? 'on' : ''}`} onClick={() => toggleIn('genres', g)}>
              {g}
            </button>
          ))}
        </fieldset>

        <div>
          <label>Etiquetas
            <input
              list="tag-options"
              placeholder="Ej: Magic, Time Skip, Isekai…"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                if (options?.tags.some((t) => t.name === e.target.value)) addTag(e.target.value);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
            />
          </label>
          <datalist id="tag-options">
            {options?.tags.map((t) => <option key={t.name} value={t.name}>{t.category}</option>)}
          </datalist>
          {!!filters.tags?.length && (
            <div className="chips" style={{ marginTop: '.5rem' }}>
              {filters.tags.map((t) => (
                <button key={t} type="button" className="chip on" onClick={() => toggleIn('tags', t)} title="Quitar">
                  {t} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="explore-results">
        <p className="muted small">
          {loading && results.length === 0 ? 'Buscando en AniList…' : `${total.toLocaleString('es')} resultados`}
        </p>
        {error && <p className="error">{error}</p>}

        <div className="grid">
          {results.map((a) => {
            const localId = mine.get(a.anilist_id);
            return (
              <article key={a.anilist_id} className="card">
                <div className="cover tall">
                  {a.cover_url ? <img src={a.cover_url} alt="" loading="lazy" /> : <span>{a.title.slice(0, 1)}</span>}
                  {a.score && <span className="score">★ {a.score}%</span>}
                </div>
                <div className="card-body">
                  <h3 title={a.title}>{a.title}</h3>
                  <span className="muted small">
                    {[
                      a.format && (FORMAT_LABELS[a.format] ?? a.format),
                      a.season && a.year ? `${SEASON_LABELS[a.season]} ${a.year}` : a.year,
                      a.total_episodes ? `${a.total_episodes} caps.` : null,
                      a.airing_status && AIRING_LABELS[a.airing_status],
                    ].filter(Boolean).join(' · ')}
                  </span>
                  <div className="genre-list">
                    {a.genres.slice(0, 3).map((g) => (
                      <button key={g} className="genre" onClick={() => !filters.genres?.includes(g) && toggleIn('genres', g)}>{g}</button>
                    ))}
                  </div>
                  {localId ? (
                    <Link href={`/animes/${localId}`} className="btn small-btn">✓ En tu lista</Link>
                  ) : (
                    <div className="row">
                      <button className="btn primary grow small-btn" onClick={() => add(a, 'watching')}>▶ Viendo</button>
                      <button className="btn grow small-btn" onClick={() => add(a, 'plan_to_watch')} title={STATUS_LABELS.plan_to_watch}>
                        + Pendiente
                      </button>
                    </div>
                  )}
                  <a href={a.site_url} target="_blank" rel="noreferrer" className="small">Ver en AniList ↗</a>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !error && results.length === 0 && <p className="empty">No hay animes con esos filtros.</p>}
        {hasNext && (
          <div className="row" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <button className="btn" disabled={loading} onClick={() => load(page + 1)}>
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
