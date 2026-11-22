import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module.js';
import { AnimesModule } from './animes/animes.module.js';
import { HealthController } from './health.controller.js';
import { AniListModule } from './anilist/anilist.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { CronModule } from './cron/cron.module.js';
import { AiModule } from './ai/ai.module.js';
import { AiService } from './ai/ai.service.js';
import { SocialModule } from './social/social.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), SupabaseModule, AniListModule, AnimesModule, ProfileModule, CronModule, AiModule, SocialModule],
  controllers: [HealthController],
  providers: [AiService],
})
export class AppModule {}
