import { Module } from '@nestjs/common';
import { AniListService } from './anilist.service.js';
import { CatalogController } from './catalog.controller.js';

@Module({
  controllers: [CatalogController],
  providers: [AniListService],
  exports: [AniListService],
})
export class AniListModule {}
