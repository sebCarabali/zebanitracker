import {
  Body, Controller, DefaultValuePipe, Delete, Get, Header, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SupabaseAuthGuard } from '../auth/auth.guard.js';
import { AccessToken, UserId } from '../auth/current-user.decorator.js';
import { AnimesService } from './animes.service.js';
import { CreateAnimeDto, ImportAniListDto, ImportMalDto, ListAnimesQuery, SetProgressDto, SyncEpisodesDto, UpdateAnimeDto } from './dto/anime.dto.js';

@Controller('animes')
@UseGuards(SupabaseAuthGuard)
export class AnimesController {
  constructor(private readonly animes: AnimesService) {}

  @Get()
  list(@AccessToken() token: string, @Query() query: ListAnimesQuery) {
    return this.animes.list(token, query);
  }

  /** Capítulos marcados en los últimos N días (máx. 400) para historial, racha y mapa de actividad. */
  @Get('activity')
  activity(@AccessToken() token: string, @Query('days', new DefaultValuePipe(365), ParseIntPipe) days: number) {
    return this.animes.activity(token, Math.min(Math.max(days, 1), 400));
  }

  /** Recomendaciones y secuelas pendientes. */
  @Get('discover')
  discover(@AccessToken() token: string) {
    return this.animes.discover(token);
  }

  /** Descarga la lista en el formato XML de MyAnimeList. */
  @Get('export/mal')
  async exportMal(@AccessToken() token: string, @Res() res: Response) {
    const { xml, exported, skipped } = await this.animes.exportMal(token);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="zebanitracker-mal.xml"');
    res.setHeader('X-Exported', String(exported));
    res.setHeader('X-Skipped', String(skipped));
    res.setHeader('Access-Control-Expose-Headers', 'X-Exported, X-Skipped, Content-Disposition');
    res.send(xml);
  }

  /** Importa el XML exportado desde MyAnimeList. */
  @Post('import/mal')
  importMal(@AccessToken() token: string, @UserId() userId: string, @Body() dto: ImportMalDto) {
    return this.animes.importFromMal(token, userId, dto.xml);
  }

  /** Importa o sincroniza la lista pública de AniList del usuario indicado. */
  @Post('import/anilist')
  importAniList(@AccessToken() token: string, @UserId() userId: string, @Body() dto: ImportAniListDto) {
    return this.animes.importFromAniList(token, userId, dto);
  }

  /** Completa capítulos y datos de emisión desde AniList (solo lo desactualizado, salvo force). */
  @Post('sync-episodes')
  syncEpisodes(@AccessToken() token: string, @Body() dto: SyncEpisodesDto) {
    return this.animes.syncEpisodes(token, { force: dto.force });
  }

  @Post(':id/sync')
  async syncOne(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.animes.syncEpisodes(token, { ids: [id], force: true });
    return this.animes.findOne(token, id);
  }

  @Get(':id')
  findOne(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.animes.findOne(token, id);
  }

  @Post()
  create(@AccessToken() token: string, @Body() dto: CreateAnimeDto) {
    return this.animes.create(token, dto);
  }

  @Patch(':id')
  update(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnimeDto) {
    return this.animes.update(token, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.animes.remove(token, id);
  }

  @Post(':id/favorite')
  toggleFavorite(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.animes.toggleFavorite(token, id);
  }

  /** Fija el último capítulo visto. */
  @Patch(':id/progress')
  setProgress(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProgressDto) {
    return this.animes.setProgress(token, id, dto.episode, dto.url);
  }

  @Post(':id/progress/next')
  next(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.animes.increment(token, id, 1);
  }

  @Post(':id/progress/prev')
  prev(@AccessToken() token: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.animes.increment(token, id, -1);
  }
}
