import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const bool = (v: unknown) => v === 'true' || v === '1';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url().default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-5-nano'),
    OPENAI_MODERATION_MODEL: z.string().default('omni-moderation-latest'),
    MODERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),


    JOIN_RADIUS_M: z.coerce.number().positive().default(200),
    LEAVE_RADIUS_M: z.coerce.number().positive().default(250),
    MAX_ACCURACY_M: z.coerce.number().positive().default(100),
    HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(25),
    STALE_AFTER_SEC: z.coerce.number().int().positive().default(120),
    WEAK_GPS_GRACE_SEC: z.coerce.number().int().positive().default(300),
    OUT_OF_RANGE_STRIKES: z.coerce.number().int().positive().default(2),
    MAX_SPEED_MPS: z.coerce.number().positive().default(50),
    /** Development only: accept fixes flagged as simulated (iOS simulator, Android emulator). */
    ALLOW_MOCK_LOCATIONS: z.preprocess(bool, z.boolean()).default(false),
    /** Places are always discovered at least this far around a point (zoomed-in tier). */
    DISCOVERY_RADIUS_M: z.coerce.number().positive().default(1500),
    /** Widest area one discovery run (or one map viewport) may cover: enough for a whole city. */
    DISCOVERY_MAX_RADIUS_M: z.coerce.number().positive().default(12_000),
    NEARBY_MAX_VENUES: z.coerce.number().int().positive().default(150),

    OVERPASS_URL: z.url().default('https://overpass-api.de/api/interpreter'),
    OVERPASS_FALLBACK_URLS: z.string().default('https://overpass.kumi.systems/api/interpreter'),
    OVERPASS_CONTACT: z.string().default('dogukangundogan5@gmail.com'),
    OSM_CACHE_TTL_SEC: z.coerce.number().int().positive().default(86_400),

    /** Neighbourhood marketplace. Unset = on everywhere except production. */
    MARKET_ENABLED: z.preprocess((v) => (v === undefined || v === '' ? undefined : bool(v)), z.boolean().optional()),
    /** Stripe payments inside the marketplace; needs the Stripe keys in production. */
    MARKET_PAYMENTS_ENABLED: z.preprocess(bool, z.boolean()).default(false),

    REPORT_AUTO_HIDE_THRESHOLD: z.coerce.number().int().positive().default(3),
    MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
    MODERATION_RECORD_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

    LOG_PRETTY: z.preprocess(bool, z.boolean()).default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'test' && !env.OPENAI_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'required outside the test environment' });
    }
    if (env.NODE_ENV === 'production') {
      if (env.ALLOW_MOCK_LOCATIONS) ctx.addIssue({ code: 'custom', path: ['ALLOW_MOCK_LOCATIONS'], message: 'must be off in production' });
    }
    if (env.LEAVE_RADIUS_M < env.JOIN_RADIUS_M) {
      ctx.addIssue({ code: 'custom', path: ['LEAVE_RADIUS_M'], message: 'must be >= JOIN_RADIUS_M' });
    }
    if (env.DISCOVERY_MAX_RADIUS_M < env.DISCOVERY_RADIUS_M) {
      ctx.addIssue({ code: 'custom', path: ['DISCOVERY_MAX_RADIUS_M'], message: 'must be >= DISCOVERY_RADIUS_M' });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Capabilities of this backend build and configuration, sent to the apps in `GET /me`. */
export interface Features {
  images: boolean;
  polls: boolean;
  market: boolean;
  payments: boolean;
}

export function marketEnabled(env: Pick<Env, 'MARKET_ENABLED' | 'NODE_ENV'>): boolean {
  return env.MARKET_ENABLED ?? env.NODE_ENV !== 'production';
}

export function featuresOf(env: Pick<Env, 'MARKET_ENABLED' | 'MARKET_PAYMENTS_ENABLED' | 'NODE_ENV'>): Features {
  const market = marketEnabled(env);
  // images and polls flip to true when their milestones ship; market/payments are configuration.
  return { images: false, polls: false, market, payments: market && env.MARKET_PAYMENTS_ENABLED };
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }
  return result.data;
}

export function loadDotEnvIfPresent(path = '.env'): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return; // optional
  }
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
