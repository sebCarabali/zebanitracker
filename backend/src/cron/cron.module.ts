import { Module } from '@nestjs/common';
import { AniListModule } from '../anilist/anilist.module.js';
import { NotifyController } from './notify.controller.js';

@Module({ imports: [AniListModule], controllers: [NotifyController] })
export class CronModule {}
