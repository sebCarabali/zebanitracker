import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { AnimesModule } from './animes/animes.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule, AnimesModule],
  controllers: [HealthController],
})
export class AppModule {}
