import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { AnimesModule } from '../animes/animes.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { TranslationCacheService } from './translation-cache.service.js';

@Module({
  imports: [AniListModule, AnimesModule],
  controllers: [AiController],
  providers: [AiService, TranslationCacheService],
})
export class AiModule {}
