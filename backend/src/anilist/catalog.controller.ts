import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AniListService } from './anilist.service.js';

/** Búsqueda en el catálogo de AniList (requiere sesión para evitar abuso del límite de AniList). */
@Controller('catalog')
@UseGuards(SupabaseAuthGuard)
export class CatalogController {
  constructor(private readonly anilist: AniListService) {}

  @Get('search')
  search(@Query('q') q?: string) {
    const term = (q ?? '').trim();
    if (term.length < 2 || term.length > 100) throw new BadRequestException('La búsqueda debe tener entre 2 y 100 caracteres');
    return this.anilist.search(term);
  }
}
