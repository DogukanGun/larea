import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { buildOpenApiDocument } from './openapi.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  await app.listen(env.PORT);
  app.get(Logger).log(`Larea backend listening on ${env.PUBLIC_URL} (port ${env.PORT})`);
}

await bootstrap();
