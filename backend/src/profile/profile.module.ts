import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { ProfileController, PublicController } from './profile.controller.js';

@Module({
  imports: [AniListModule],
  controllers: [ProfileController, PublicController],
})
export class ProfileModule {}
