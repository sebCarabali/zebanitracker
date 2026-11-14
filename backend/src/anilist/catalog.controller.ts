import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AniListService } from './anilist.service.js';
import { BrowseQuery, MediaSort } from './browse.dto.js';

/** Catálogo de AniList (requiere sesión para no agotar el límite de AniList con tráfico anónimo). */
@Controller('catalog')
@UseGuards(SupabaseAuthGuard)
export class CatalogController {
  constructor(private readonly anilist: AniListService) {}

  /** Autocompletado rápido por nombre. */
  @Get('search')
  search(@Query('q') q?: string) {
    const term = (q ?? '').trim();
    if (term.length < 2 || term.length > 100) throw new BadRequestException('La búsqueda debe tener entre 2 y 100 caracteres');
    return this.anilist.search(term);
  }

  /** Explorar con filtros: search, genres, tags, year, season, formats, status, sort, page. */
  @Get('browse')
  browse(@Query() q: BrowseQuery) {
    if (q.sort === MediaSort.SearchMatch && !q.search) q.sort = undefined; // SEARCH_MATCH requiere texto
    return this.anilist.browse(q);
  }

  /** Ficha completa: sinopsis, estudio, duración, fechas, relaciones… */
  @Get('anime/:id')
  details(@Param('id', ParseIntPipe) id: number) {
    return this.anilist.details(id);
  }

  /** Géneros y etiquetas disponibles para los filtros. */
  @Get('filters')
  filters() {
    return this.anilist.filterOptions();
  }
}
