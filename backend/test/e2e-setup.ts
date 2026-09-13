import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Loads .env.test before any module reads the environment.
process.loadEnvFile(new URL('../.env.test', import.meta.url).pathname);
// Uploaded files go to a throwaway directory per test run.
process.env.MEDIA_DIR ??= mkdtempSync(join(tmpdir(), 'larea-media-'));
