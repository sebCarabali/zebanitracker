import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { AiModule } from '../ai/ai.module.js';
import { NotifyController } from './notify.controller.js';

@Module({ imports: [AniListModule, AiModule], controllers: [NotifyController] })
export class CronModule {}
