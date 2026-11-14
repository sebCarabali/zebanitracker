import { BadGatewayException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

const ENDPOINT = 'https://graphql.anilist.co';

/** Resultado normalizado de un anime del catálogo de AniList. */
export interface CatalogAnime {
  anilist_id: number;
  title: string;
  title_romaji: string | null;
  title_english: string | null;
  total_episodes: number | null;
  cover_url: string | null;
  site_url: string;
  format: string | null;
  year: number | null;
  airing_status: string | null;
  season: string | null;
  genres: string[];
  score: number | null;
  /** Capítulos ya emitidos (si está en emisión: el anterior al próximo; si terminó: el total). */
  aired_episodes: number | null;
  /** Fecha ISO del próximo capítulo, si está en emisión. */
  next_episode_at: string | null;
  next_episode: number | null;
  mal_id: number | null;
  studios: string[];
}

export interface DiscoverItem { media: CatalogAnime; because: string[]; rating: number }
export interface SequelItem { media: CatalogAnime; after: string }

export interface BrowseFilters {
  search?: string;
  genres?: string[];
  tags?: string[];
  year?: number;
  season?: string;
  formats?: string[];
  status?: string;
  sort?: string;
  page?: number;
}

export interface BrowseResult {
  results: CatalogAnime[];
  page: number;
  hasNextPage: boolean;
  total: number;
}

export interface AnimeDetails extends CatalogAnime {
  description: string | null;
  banner_url: string | null;
  cover_large_url: string | null;
  duration: number | null;
  studios: string[];
  source: string | null;
  start_date: string | null;
  end_date: string | null;
  popularity: number | null;
  tags: string[];
  trailer_url: string | null;
  relations: { anilist_id: number; title: string; relation: string; format: string | null; cover_url: string | null }[];
}

export interface FilterOptions {
  genres: string[];
  tags: { name: string; category: string }[];
}

export type AniListListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export interface AniListEntry {
  media: CatalogAnime;
  status: AniListListStatus;
  progress: number;
}

interface RawMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  episodes: number | null;
  coverImage: { large: string | null } | null;
  siteUrl: string;
  format: string | null;
  seasonYear: number | null;
  season?: string | null;
  status: string | null;
  genres?: string[];
  averageScore?: number | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  idMal?: number | null;
  studios?: { nodes: { name: string }[] } | null;
}

const MEDIA_FIELDS = `
  id
  title { romaji english }
  episodes
  coverImage { large }
  siteUrl
  format
  seasonYear
  season
  status
  genres
  averageScore
  nextAiringEpisode { episode airingAt }
  idMal
  studios(isMain: true) { nodes { name } }
`;

const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 8) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) { ${MEDIA_FIELDS} }
  }
}`;

const LIST_QUERY = `
query ($userName: String) {
  MediaListCollection(userName: $userName, type: ANIME) {
    lists {
      isCustomList
      entries { status progress media { ${MEDIA_FIELDS} } }
    }
  }
}`;

const BROWSE_QUERY = `
query ($page: Int, $search: String, $genres: [String], $tags: [String], $year: Int, $season: MediaSeason,
       $formats: [MediaFormat], $status: MediaStatus, $sort: [MediaSort]) {
  Page(page: $page, perPage: 24) {
    pageInfo { hasNextPage total }
    media(type: ANIME, isAdult: false, search: $search, genre_in: $genres, tag_in: $tags, seasonYear: $year,
          season: $season, format_in: $formats, status: $status, sort: $sort) { ${MEDIA_FIELDS} }
  }
}`;

const BY_IDS_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) { ${MEDIA_FIELDS} }
  }
}`;

const DETAILS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    description(asHtml: false)
    bannerImage
    coverImage { extraLarge large }
    duration
    source
    popularity
    startDate { year month day }
    endDate { year month day }
    tags { name rank isMediaSpoiler isAdult }
    trailer { id site }
    relations {
      edges {
        relationType(version: 2)
        node { id type format title { romaji english } coverImage { large } }
      }
    }
  }
}`;

const DISCOVER_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      title { romaji english }
      recommendations(sort: RATING_DESC, perPage: 6) {
        nodes { rating mediaRecommendation { type isAdult ${MEDIA_FIELDS} } }
      }
      relations { edges { relationType(version: 2) node { type isAdult ${MEDIA_FIELDS} } } }
    }
  }
}`;

const BY_MAL_QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(idMal_in: $ids, type: ANIME) { ${MEDIA_FIELDS} }
  }
}`;

const VIEWER_QUERY = `query { Viewer { id name } }`;

const SAVE_ENTRY_MUTATION = `
mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $scoreRaw: Int) {
  SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status, scoreRaw: $scoreRaw) { id }
}`;

const FILTERS_QUERY = `
query {
  GenreCollection
  MediaTagCollection { name category isAdult }
}`;

const FAVOURITES_QUERY = `
query ($userName: String, $page: Int) {
  User(name: $userName) {
    favourites {
      anime(page: $page, perPage: 25) {
        pageInfo { hasNextPage }
        nodes { id }
      }
    }
  }
}`;

/**
 * Cliente de la API pública y gratuita de AniList (GraphQL, sin API key).
 * Límite: 90 req/min (a veces reducido a 30), por eso las búsquedas se cachean.
 */
@Injectable()
export class AniListService {
  private readonly cache = new Map<string, { at: number; data: CatalogAnime[] }>();
  private readonly browseCache = new Map<string, { at: number; data: BrowseResult }>();
  private readonly detailsCache = new Map<number, { at: number; data: AnimeDetails }>();
  private readonly discoverCache = new Map<string, { at: number; data: any[] }>();
  private filtersCache: { at: number; data: FilterOptions } | null = null;
  private static readonly TTL_MS = 10 * 60 * 1000;
  private static readonly MAX_CACHE = 300;

  private async query<T>(query: string, variables: Record<string, unknown>, token?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException('No se pudo conectar con AniList');
    }

    if (res.status === 429) {
      throw new HttpException('AniList está limitando las peticiones; intenta en un minuto', HttpStatus.TOO_MANY_REQUESTS);
    }
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string; status?: number }[] };
    if (res.status === 401 || res.status === 400 && body.errors?.[0]?.message?.includes('Invalid token')) {
      throw new UnauthorizedException('El token de AniList no es válido o expiró; vuelve a conectar AniList');
    }
    if (body.errors?.length) {
      const err = body.errors[0];
      if (err.status === 404) throw new NotFoundException('Usuario de AniList no encontrado o con lista privada');
      throw new BadGatewayException(`AniList: ${err.message}`);
    }
    if (!res.ok || !body.data) throw new BadGatewayException(`AniList respondió ${res.status}`);
    return body.data;
  }

  private static normalize(m: RawMedia): CatalogAnime {
    return {
      anilist_id: m.id,
      title: m.title.english || m.title.romaji || `AniList #${m.id}`,
      title_romaji: m.title.romaji,
      title_english: m.title.english,
      total_episodes: m.episodes,
      cover_url: m.coverImage?.large ?? null,
      site_url: m.siteUrl,
      format: m.format,
      year: m.seasonYear,
      airing_status: m.status,
      season: m.season ?? null,
      genres: m.genres ?? [],
      score: m.averageScore ?? null,
      aired_episodes: m.nextAiringEpisode
        ? m.nextAiringEpisode.episode - 1
        : m.status === 'FINISHED' ? m.episodes : null,
      next_episode_at: m.nextAiringEpisode ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString() : null,
      next_episode: m.nextAiringEpisode?.episode ?? null,
      mal_id: m.idMal ?? null,
      studios: m.studios?.nodes.map((n) => n.name) ?? [],
    };
  }

  async search(term: string): Promise<CatalogAnime[]> {
    const key = term.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < AniListService.TTL_MS) return hit.data;

    const data = await this.query<{ Page: { media: RawMedia[] } }>(SEARCH_QUERY, { search: term.trim() });
    const results = data.Page.media.map(AniListService.normalize);

    if (this.cache.size >= AniListService.MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: Date.now(), data: results });
    return results;
  }

  /** Explorar el catálogo con filtros (búsqueda, géneros, etiquetas, año, temporada, formato, estado). */
  async browse(f: BrowseFilters): Promise<BrowseResult> {
    const page = f.page ?? 1;
    const variables: Record<string, unknown> = {
      page,
      search: f.search?.trim() || undefined,
      genres: f.genres?.length ? f.genres : undefined,
      tags: f.tags?.length ? f.tags : undefined,
      year: f.year,
      season: f.season,
      formats: f.formats?.length ? f.formats : undefined,
      status: f.status,
      sort: [f.sort ?? (f.search ? 'SEARCH_MATCH' : 'POPULARITY_DESC')],
    };
    const key = 'browse:' + JSON.stringify(variables);
    const hit = this.browseCache.get(key);
    if (hit && Date.now() - hit.at < AniListService.TTL_MS) return hit.data;

    const data = await this.query<{
      Page: { pageInfo: { hasNextPage: boolean; total: number }; media: RawMedia[] };
    }>(BROWSE_QUERY, variables);
    const result: BrowseResult = {
      results: data.Page.media.map(AniListService.normalize),
      page,
      hasNextPage: data.Page.pageInfo.hasNextPage,
      total: data.Page.pageInfo.total,
    };
    if (this.browseCache.size >= AniListService.MAX_CACHE) this.browseCache.delete(this.browseCache.keys().next().value!);
    this.browseCache.set(key, { at: Date.now(), data: result });
    return result;
  }

  /** Datos actuales de varios animes por ID de AniList (lotes de 50 = 1 petición por lote). */
  async byIds(ids: number[]): Promise<Map<number, CatalogAnime>> {
    const out = new Map<number, CatalogAnime>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 50) {
      const data = await this.query<{ Page: { media: RawMedia[] } }>(BY_IDS_QUERY, { ids: unique.slice(i, i + 50) });
      for (const m of data.Page.media) out.set(m.id, AniListService.normalize(m));
    }
    return out;
  }

  /** Ficha completa de un anime (caché de 1 h). */
  async details(id: number): Promise<AnimeDetails> {
    const hit = this.detailsCache.get(id);
    if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;

    type Raw = RawMedia & {
      description: string | null;
      bannerImage: string | null;
      coverImage: { extraLarge: string | null; large: string | null } | null;
      duration: number | null;
      source: string | null;
      popularity: number | null;
      startDate: { year: number | null; month: number | null; day: number | null } | null;
      endDate: { year: number | null; month: number | null; day: number | null } | null;
      tags: { name: string; rank: number; isMediaSpoiler: boolean; isAdult: boolean }[] | null;
      trailer: { id: string; site: string } | null;
      relations: { edges: { relationType: string; node: { id: number; type: string; format: string | null; title: { romaji: string | null; english: string | null }; coverImage: { large: string | null } | null } }[] } | null;
    };
    const data = await this.query<{ Media: Raw | null }>(DETAILS_QUERY, { id });
    const m = data.Media;
    if (!m) throw new NotFoundException('Anime no encontrado en AniList');

    const date = (d: Raw['startDate']) =>
      d?.year ? [d.year, String(d.month ?? 1).padStart(2, '0'), String(d.day ?? 1).padStart(2, '0')].join('-') : null;

    const result: AnimeDetails = {
      ...AniListService.normalize(m),
      description: cleanDescription(m.description),
      banner_url: m.bannerImage,
      cover_large_url: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
      duration: m.duration,
      source: m.source,
      start_date: date(m.startDate),
      end_date: date(m.endDate),
      popularity: m.popularity,
      tags: (m.tags ?? []).filter((t) => !t.isMediaSpoiler && !t.isAdult && t.rank >= 60).slice(0, 8).map((t) => t.name),
      trailer_url: m.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${m.trailer.id}` : null,
      relations: (m.relations?.edges ?? [])
        .filter((e) => e.node.type === 'ANIME')
        .slice(0, 8)
        .map((e) => ({
          anilist_id: e.node.id,
          title: e.node.title.english || e.node.title.romaji || `AniList #${e.node.id}`,
          relation: e.relationType,
          format: e.node.format,
          cover_url: e.node.coverImage?.large ?? null,
        })),
    };
    if (this.detailsCache.size >= AniListService.MAX_CACHE) this.detailsCache.delete(this.detailsCache.keys().next().value!);
    this.detailsCache.set(id, { at: Date.now(), data: result });
    return result;
  }

  /**
   * Recomendaciones (a partir de `seedIds`) y secuelas (de `completedIds`) en una sola petición.
   */
  async discover(seedIds: number[], completedIds: number[]) {
    const ids = [...new Set([...seedIds, ...completedIds])].slice(0, 50);
    if (!ids.length) return { recommendations: [] as DiscoverItem[], sequels: [] as SequelItem[] };
    const key = ids.slice().sort((a, b) => a - b).join(',');
    const hit = this.discoverCache.get(key);
    if (hit && Date.now() - hit.at < 60 * 60 * 1000) return this.splitDiscover(hit.data, seedIds, completedIds);

    type Node = RawMedia & { type: string; isAdult: boolean };
    const data = await this.query<{
      Page: { media: { id: number; title: { romaji: string | null; english: string | null };
        recommendations: { nodes: { rating: number; mediaRecommendation: Node | null }[] };
        relations: { edges: { relationType: string; node: Node }[] } }[] };
    }>(DISCOVER_QUERY, { ids });
    if (this.discoverCache.size >= 50) this.discoverCache.delete(this.discoverCache.keys().next().value!);
    this.discoverCache.set(key, { at: Date.now(), data: data.Page.media });
    return this.splitDiscover(data.Page.media, seedIds, completedIds);
  }

  private splitDiscover(
    media: { id: number; title: { romaji: string | null; english: string | null };
      recommendations: { nodes: { rating: number; mediaRecommendation: (RawMedia & { type: string; isAdult: boolean }) | null }[] };
      relations: { edges: { relationType: string; node: RawMedia & { type: string; isAdult: boolean } }[] } }[],
    seedIds: number[], completedIds: number[],
  ) {
    const seeds = new Set(seedIds);
    const completed = new Set(completedIds);
    const recs = new Map<number, DiscoverItem>();
    const sequels = new Map<number, SequelItem>();
    for (const m of media) {
      const name = m.title.english || m.title.romaji || `#${m.id}`;
      if (seeds.has(m.id)) {
        for (const n of m.recommendations.nodes) {
          const r = n.mediaRecommendation;
          if (!r || r.type !== 'ANIME' || r.isAdult || n.rating <= 0) continue;
          const item = recs.get(r.id) ?? { media: AniListService.normalize(r), because: [], rating: 0 };
          item.because.push(name);
          item.rating += n.rating;
          recs.set(r.id, item);
        }
      }
      if (completed.has(m.id)) {
        for (const e of m.relations.edges) {
          if (e.relationType !== 'SEQUEL' || e.node.type !== 'ANIME' || e.node.isAdult) continue;
          if (!sequels.has(e.node.id)) sequels.set(e.node.id, { media: AniListService.normalize(e.node), after: name });
        }
      }
    }
    return {
      recommendations: [...recs.values()].sort((a, b) => b.because.length - a.because.length || b.rating - a.rating),
      sequels: [...sequels.values()],
    };
  }

  /** Convierte IDs de MyAnimeList a animes de AniList (lotes de 50). */
  async byMalIds(malIds: number[]): Promise<Map<number, CatalogAnime>> {
    const out = new Map<number, CatalogAnime>();
    const unique = [...new Set(malIds)];
    for (let i = 0; i < unique.length; i += 50) {
      const data = await this.query<{ Page: { media: RawMedia[] } }>(BY_MAL_QUERY, { ids: unique.slice(i, i + 50) });
      for (const m of data.Page.media) if (m.idMal) out.set(m.idMal, AniListService.normalize(m));
    }
    return out;
  }

  /** Usuario de AniList dueño del token (para conectar la cuenta). */
  async viewer(token: string): Promise<{ id: number; name: string }> {
    const data = await this.query<{ Viewer: { id: number; name: string } }>(VIEWER_QUERY, {}, token);
    return data.Viewer;
  }

  /** Actualiza la entrada del usuario en su lista de AniList. */
  async saveListEntry(token: string, entry: { mediaId: number; progress: number; status: string; score?: number | null }) {
    await this.query(SAVE_ENTRY_MUTATION, {
      mediaId: entry.mediaId,
      progress: entry.progress,
      status: entry.status,
      ...(entry.score ? { scoreRaw: entry.score * 10 } : {}), // scoreRaw es 0-100 sin importar el formato del usuario
    }, token);
  }

  /** Géneros y etiquetas disponibles (cambian muy poco: caché de 24 h). */
  async filterOptions(): Promise<FilterOptions> {
    if (this.filtersCache && Date.now() - this.filtersCache.at < 24 * 60 * 60 * 1000) return this.filtersCache.data;
    const data = await this.query<{
      GenreCollection: string[];
      MediaTagCollection: { name: string; category: string; isAdult: boolean }[];
    }>(FILTERS_QUERY, {});
    const result: FilterOptions = {
      genres: data.GenreCollection.filter((g) => g !== 'Hentai'),
      tags: data.MediaTagCollection.filter((t) => !t.isAdult)
        .map((t) => ({ name: t.name, category: t.category }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    this.filtersCache = { at: Date.now(), data: result };
    return result;
  }

  /** Lista pública de anime de un usuario (sin listas personalizadas, sin duplicados). */
  async userList(userName: string): Promise<AniListEntry[]> {
    const data = await this.query<{
      MediaListCollection: {
        lists: { isCustomList: boolean; entries: { status: AniListListStatus; progress: number | null; media: RawMedia }[] }[];
      } | null;
    }>(LIST_QUERY, { userName });

    const seen = new Map<number, AniListEntry>();
    for (const list of data.MediaListCollection?.lists ?? []) {
      if (list.isCustomList) continue;
      for (const e of list.entries) {
        if (!seen.has(e.media.id)) {
          seen.set(e.media.id, { media: AniListService.normalize(e.media), status: e.status, progress: e.progress ?? 0 });
        }
      }
    }
    return [...seen.values()];
  }

  /** IDs de los animes favoritos del usuario (máx. 5 páginas = 125). */
  async userFavourites(userName: string): Promise<Set<number>> {
    const ids = new Set<number>();
    for (let page = 1; page <= 5; page++) {
      const data = await this.query<{
        User: { favourites: { anime: { pageInfo: { hasNextPage: boolean }; nodes: { id: number }[] } } } | null;
      }>(FAVOURITES_QUERY, { userName, page });
      const anime = data.User?.favourites.anime;
      anime?.nodes.forEach((n) => ids.add(n.id));
      if (!anime?.pageInfo.hasNextPage) break;
    }
    return ids;
  }
}

/** La sinopsis de AniList trae algo de HTML (<br>, <i>) y entidades: se deja en texto plano. */
function cleanDescription(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
