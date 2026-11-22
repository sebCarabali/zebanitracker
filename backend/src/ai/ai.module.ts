import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { AnimesModule } from '../animes/animes.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { TranslationCacheService } from './translation-cache.service.js';
import { AiCacheService } from './ai-cache.service.js';
import { AiExtraController } from './ai-extra.controller.js';

@Module({
  imports: [AniListModule, AnimesModule],
  controllers: [AiController, AiExtraController],
  providers: [AiService, TranslationCacheService, AiCacheService],
  exports: [AiService, AiCacheService],
})
export class AiModule {}
