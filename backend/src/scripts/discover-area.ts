import { parseArgs } from 'node:util';
import { loadDotEnvIfPresent, loadEnv } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { DiscoveryService } from '../venues/discovery/discovery.service.js';
import { HttpOverpassClient } from '../venues/discovery/overpass.client.js';

/**
 * Pre-loads real places for a whole area (typically a city) from OpenStreetMap so the map is
 * complete everywhere right away instead of being discovered piece by piece as people look
 * around. Safe to re-run: places are upserted and the area cache is refreshed.
 *
 *   node dist/scripts/discover-area.js --lat 48.1374 --lng 11.5755 --radius 12000 --cafes --ttl-days 30
 */
const { values } = parseArgs({
  options: {
    lat: { type: 'string' },
    lng: { type: 'string' },
    radius: { type: 'string', default: '12000' },
    cafes: { type: 'boolean', default: false },
    'ttl-days': { type: 'string', default: '30' },
  },
});
const lat = Number(values.lat);
const lng = Number(values.lng);
const radius = Number(values.radius);
const ttlDays = Number(values['ttl-days']);
if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
  console.error('usage: discover-area --lat <deg> --lng <deg> [--radius <m>] [--cafes] [--ttl-days <n>]');
  process.exit(2);
}
if (!Number.isFinite(radius) || radius <= 0 || radius > 50_000 || !Number.isFinite(ttlDays) || ttlDays <= 0) {
  console.error('radius must be 1-50000 metres and ttl-days positive');
  process.exit(2);
}

loadDotEnvIfPresent();
const env = loadEnv();
const prisma = new PrismaService(env);
const redis = new RedisService(env);
const overpass = new HttpOverpassClient({
  url: env.OVERPASS_URL,
  fallbackUrls: env.OVERPASS_FALLBACK_URLS.split(',').map((u) => u.trim()).filter(Boolean),
  contact: env.OVERPASS_CONTACT,
});
const discovery = new DiscoveryService(env, prisma, redis, overpass);

const started = Date.now();
try {
  await prisma.$connect();
  console.log(`discovering places within ${radius} m of ${lat},${lng} via ${env.OVERPASS_URL} ...`);
  const result = await discovery.warmUp(lat, lng, radius, { cafes: values.cafes, ttlSec: Math.round(ttlDays * 86_400) });
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `done in ${seconds}s: ${result.landmarks} landmarks, ${result.parks} parks, ${result.cafes} cafés; ${result.cells} cells cached for ${ttlDays} days`,
  );
} finally {
  await prisma.$disconnect();
  await redis.client.quit().catch(() => undefined);
}
