import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig, env } from 'prisma/config';


/** Loads .env without overriding variables already present in the environment. */
function loadDotEnv(path = '.env'): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/scripts/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
