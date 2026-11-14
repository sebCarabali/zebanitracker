import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Sin origin (curl, server-to-server), web permitida o extensión de Chrome
      const matches = (rule: string) =>
        rule.includes('*')
          ? new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`).test(origin!)
          : rule === origin;
      if (!origin || allowed.some(matches) || origin.startsWith('chrome-extension://')) {
        return cb(null, true);
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
