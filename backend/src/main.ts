import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '6mb' }); // el XML de MyAnimeList puede ser grande

  const allowed = [
    ...(process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    // Todas las URLs del proyecto en Vercel: producción, ramas y despliegues concretos
    'https://zebanitracker-*.vercel.app',
    'https://zebanitracker-*-sebastin-carabalis-projects.vercel.app',
    'http://localhost:3000',
  ].map((o) => o.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean);
  const rejected = new Set<string>();

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Sin origin (curl, server-to-server), web permitida o extensión de Chrome
      const o = origin?.toLowerCase();
      const matches = (rule: string) =>
        rule.includes('*')
          ? new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`).test(o!)
          : rule === o;
      // Sin origin (curl, server-to-server), web permitida o extensión (Chrome / Edge / Firefox)
      if (!o || allowed.some(matches) || /^(chrome|moz)-extension:\/\//.test(o)) {
        return cb(null, true);
      }
      if (!rejected.has(o)) {
        rejected.add(o);
        console.warn(`[CORS] Origen rechazado: ${origin}. Agrégalo a CORS_ORIGINS si es tuyo.`);
      }
      cb(null, false); // sin cabeceras CORS: el navegador bloquea la petición
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api`);
}
bootstrap();
