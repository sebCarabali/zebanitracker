import { BadGatewayException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';

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
}

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
  private filtersCache: { at: number; data: FilterOptions } | null = null;
  private static readonly TTL_MS = 10 * 60 * 1000;
  private static readonly MAX_CACHE = 300;

  private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
