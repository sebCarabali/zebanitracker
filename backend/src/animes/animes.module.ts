import { Module } from '@nestjs/common';
import { AnimesController } from './animes.controller.js';
import { AnimesService } from './animes.service.js';

@Module({
  controllers: [AnimesController],
  providers: [AnimesService],
})
export class AnimesModule {}
