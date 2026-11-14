import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module.js';
import { AnimesModule } from './animes/animes.module.js';
import { HealthController } from './health.controller.js';
import { AniListModule } from './anilist/anilist.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), SupabaseModule, AniListModule, AnimesModule],
  controllers: [HealthController],
})
export class AppModule {}
