import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from '../openapi.js';

const outDir = new URL('../../../docs/api/', import.meta.url);
try {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  const document = buildOpenApiDocument(app);
  await mkdir(outDir, { recursive: true });
  await writeFile(new URL('openapi.json', outDir), JSON.stringify(document, null, 2) + '\n');
  await app.close();
  console.log(`OpenAPI written to ${new URL('openapi.json', outDir).pathname}`);
} catch (err) {
  console.error('OpenAPI export failed:', err);
  process.exitCode = 1;
}
