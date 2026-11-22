import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { AnimesModule } from '../animes/animes.module.js';
import { SocialController } from './social.controller.js';

@Module({
  imports: [AniListModule, AnimesModule],
  controllers: [SocialController],
})
export class SocialModule {}
