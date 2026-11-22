import { Module } from '@nestjs/common';
import { AnimesController } from './animes.controller.js';
import { AnimesService } from './animes.service.js';
import { AniListModule } from '../anilist/anilist.module.js';

@Module({
  imports: [AniListModule],
  controllers: [AnimesController],
  providers: [AnimesService],
  exports: [AnimesService],
})
export class AnimesModule {}
