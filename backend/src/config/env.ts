import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const bool = (v: unknown) => v === 'true' || v === '1';
/** An empty value in a .env file means the setting is not set. */
const emptyAsUnset = (v: unknown) => (v === '' ? undefined : v);

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

    /** Uploaded images: where the files live and how big they may be. */
    MEDIA_DIR: z.string().min(1).default('./var/uploads'),
    MEDIA_MAX_BYTES: z.coerce.number().int().min(1).max(52_428_800).default(10_485_760),
    /** Public base for served files; defaults to `${PUBLIC_URL}/media`. */
    MEDIA_PUBLIC_URL: z.url().optional(),
    MEDIA_MAX_PX: z.coerce.number().int().min(320).max(4096).default(1600),
    MEDIA_THUMB_PX: z.coerce.number().int().min(100).max(1024).default(400),
    /** Uploads never attached to anything are deleted after this. */
    MEDIA_ORPHAN_TTL_MIN: z.coerce.number().int().positive().default(60),
    /** Uploads are refused when the volume has less free space than this. */
    MEDIA_DISK_RESERVE_BYTES: z.coerce.number().int().min(0).default(1_073_741_824),

    /** Neighbourhood marketplace. Unset = on everywhere except production. */
    MARKET_ENABLED: z.preprocess((v) => (v === undefined || v === '' ? undefined : bool(v)), z.boolean().optional()),
    /** Stripe payments inside the marketplace; needs the Stripe keys in production. */
    MARKET_PAYMENTS_ENABLED: z.preprocess(bool, z.boolean()).default(false),
    /** How far around the caller listings are visible and can be dealt with. */
    MARKET_RADIUS_M: z.coerce.number().positive().default(2000),
    MARKET_CURRENCY: z.string().length(3).default('eur'),
    MARKET_FEE_PERCENT: z.coerce.number().min(0).max(30).default(10),
    MARKET_FEE_MIN_CENTS: z.coerce.number().int().min(0).default(50),
    MARKET_LISTING_TTL_DAYS: z.coerce.number().int().positive().default(30),
    MARKET_LISTING_PURGE_DAYS: z.coerce.number().int().positive().default(30),
    MARKET_OFFER_TTL_HOURS: z.coerce.number().int().positive().default(72),
    MARKET_MIN_PRICE_CENTS: z.coerce.number().int().positive().default(100),
    MARKET_MAX_PRICE_CENTS: z.coerce.number().int().positive().default(50_000),
    MARKET_MAX_DAILY_VOLUME_CENTS: z.coerce.number().int().positive().default(100_000),
    MARKET_MAX_IMAGES: z.coerce.number().int().min(0).max(10).default(5),
    /** Most listings one feed request returns. */
    MARKET_MAX_LISTINGS: z.coerce.number().int().positive().default(100),
    /** Accounts younger than this cannot list or offer (throwaway-account brake). */
    MARKET_MIN_ACCOUNT_AGE_HOURS: z.coerce.number().min(0).default(24),
    /** Paid orders nobody approved are refunded after this many days. */
    MARKET_APPROVAL_DAYS: z.coerce.number().int().positive().default(14),
    /** Accepted offers must be paid within this window. */
    MARKET_PAYMENT_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
    /** URL scheme the apps register for the return from Stripe pages. */
    MARKET_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default('larea'),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_ACCOUNT_COUNTRY: z.string().length(2).default('DE'),
    /** Production refuses test keys unless this is set (the Hetzner test server sets it). */
    STRIPE_ALLOW_TEST_MODE: z.preprocess(bool, z.boolean()).default(false),

    /**
     * Solana features for the dApp Store build of the Android app: check-in stamps (soulbound compressed
     * NFTs), stamp-gated chat, loyalty levels, tips and USDC marketplace payments. See docs/solana.md.
     */
    SOLANA_ENABLED: z.preprocess(bool, z.boolean()).default(false),
    /** `localnet` (solana-test-validator), `devnet` or `mainnet`; only used for explorer links and checks. */
    SOLANA_CLUSTER: z.enum(['localnet', 'devnet', 'mainnet']).default('devnet'),
    SOLANA_RPC_URL: z.url().default('https://api.devnet.solana.com'),
    /** A Digital Asset Standard RPC (Helius, Triton, …) for reading compressed NFTs; optional. */
    SOLANA_DAS_URL: z.preprocess(emptyAsUnset, z.url().optional()),
    /** Base58 secret keys: tree/collection authority, marketplace escrow, loyalty rewards. */
    SOLANA_AUTHORITY_SECRET: z.string().optional(),
    SOLANA_ESCROW_SECRET: z.string().optional(),
    SOLANA_REWARDS_SECRET: z.string().optional(),
    SOLANA_STAMP_TREE: z.string().optional(),
    SOLANA_STAMP_COLLECTION: z.string().optional(),
    SOLANA_LEVEL_COLLECTION: z.string().optional(),
    USDC_MINT: z.string().optional(),
    SKR_MINT: z.string().optional(),
    /** Base URL of the stamp and level metadata JSON (served by this backend). */
    SOLANA_METADATA_URL: z.preprocess(emptyAsUnset, z.url().optional()),
    /** Stamps on distinct days needed for Regular, Local and Legend at one place. */
    LOYALTY_LEVELS: z
      .string()
      .default('5,15,40')
      .refine((v) => /^\d+,\d+,\d+$/.test(v), 'three comma-separated counts'),
    /** SKR sent from the rewards wallet when someone reaches a level (whole tokens; 0 = off). */
    SKR_LEVEL_REWARD: z.coerce.number().min(0).default(5),
    /** A check-in transaction the wallet did not send within this window is given up. */
    SOLANA_PENDING_TTL_SEC: z.coerce.number().int().positive().default(600),

    /** Paid message pins on the map (App Store / Play purchases, USDC on the dApp Store build). */
    PINS_ENABLED: z.preprocess((v) => (v === undefined || v === '' ? undefined : bool(v)), z.boolean().default(true)),
    /** A pin this close to the buyer is the cheapest (NEARBY) tier. */
    PIN_NEARBY_RADIUS_M: z.coerce.number().positive().default(1000),
    /** How close people must be to a pin to read and write in its chat (its owner is exempt). */
    PIN_CHAT_RADIUS_M: z.coerce.number().positive().default(300),
    /** Unpaid quotes are kept this long so a purchase that lands late still finds its pin. */
    PIN_PENDING_TTL_DAYS: z.coerce.number().int().positive().default(7),
    PIN_MAX_PER_MAP: z.coerce.number().int().positive().default(200),
    /** Reverse geocoding for the city and country tiers (OpenStreetMap Nominatim; self-hostable). */
    NOMINATIM_URL: z.url().default('https://nominatim.openstreetmap.org'),
    /** App Store: the app's bundle id and Apple id (the numeric id is required to verify production purchases). */
    APPLE_BUNDLE_ID: z.string().default('com.dogukangundogan.larea'),
    APPLE_APP_ID: z.preprocess(emptyAsUnset, z.coerce.number().int().positive().optional()),
    /** Development only: accept purchases signed by Xcode's local StoreKit configuration. */
    APPLE_IAP_ALLOW_XCODE: z.preprocess(bool, z.boolean()).default(false),
    /** Directory with Apple's root certificates (AppleRootCA-G2.cer, AppleRootCA-G3.cer). */
    APPLE_ROOT_CERTS_DIR: z.string().default('./certs/apple'),
    /** Google Play: package name and a service account key file with access to the Play Developer API. */
    GOOGLE_PLAY_PACKAGE: z.string().default('com.dogukangundogan.larea'),
    GOOGLE_PLAY_SERVICE_ACCOUNT_FILE: z.preprocess(emptyAsUnset, z.string().optional()),

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
      if (env.APPLE_IAP_ALLOW_XCODE) ctx.addIssue({ code: 'custom', path: ['APPLE_IAP_ALLOW_XCODE'], message: 'must be off in production' });
    }
    if (env.LEAVE_RADIUS_M < env.JOIN_RADIUS_M) {
      ctx.addIssue({ code: 'custom', path: ['LEAVE_RADIUS_M'], message: 'must be >= JOIN_RADIUS_M' });
    }
    if (env.DISCOVERY_MAX_RADIUS_M < env.DISCOVERY_RADIUS_M) {
      ctx.addIssue({ code: 'custom', path: ['DISCOVERY_MAX_RADIUS_M'], message: 'must be >= DISCOVERY_RADIUS_M' });
    }
    if (env.MARKET_MAX_PRICE_CENTS < env.MARKET_MIN_PRICE_CENTS) {
      ctx.addIssue({ code: 'custom', path: ['MARKET_MAX_PRICE_CENTS'], message: 'must be >= MARKET_MIN_PRICE_CENTS' });
    }
    if (env.SOLANA_ENABLED && env.NODE_ENV !== 'test') {
      for (const key of ['SOLANA_AUTHORITY_SECRET', 'SOLANA_ESCROW_SECRET', 'SOLANA_REWARDS_SECRET', 'SOLANA_STAMP_TREE', 'SOLANA_STAMP_COLLECTION', 'SOLANA_LEVEL_COLLECTION', 'USDC_MINT', 'SKR_MINT'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'required when SOLANA_ENABLED=1 (run pnpm solana:setup)' });
      }
    }
    if (env.NODE_ENV === 'production' && env.MARKET_PAYMENTS_ENABLED) {
      if (!env.STRIPE_SECRET_KEY) ctx.addIssue({ code: 'custom', path: ['STRIPE_SECRET_KEY'], message: 'required when MARKET_PAYMENTS_ENABLED=1' });
      if (!env.STRIPE_WEBHOOK_SECRET) ctx.addIssue({ code: 'custom', path: ['STRIPE_WEBHOOK_SECRET'], message: 'required when MARKET_PAYMENTS_ENABLED=1' });
      if (env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && !env.STRIPE_ALLOW_TEST_MODE) {
        ctx.addIssue({ code: 'custom', path: ['STRIPE_SECRET_KEY'], message: 'test key in production; set STRIPE_ALLOW_TEST_MODE=1 on a test server' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Capabilities of this backend build and configuration, sent to the apps in `GET /me`. */
export interface Features {
  images: boolean;
  polls: boolean;
  market: boolean;
  payments: boolean;
  /** Solana features (stamps, tips, USDC market); only the dApp Store build uses them. */
  solana: boolean;
  /** Paid message pins on the map. */
  pins: boolean;
}

export function marketEnabled(env: Pick<Env, 'MARKET_ENABLED' | 'NODE_ENV'>): boolean {
  return env.MARKET_ENABLED ?? env.NODE_ENV !== 'production';
}

export function featuresOf(env: Pick<Env, 'MARKET_ENABLED' | 'MARKET_PAYMENTS_ENABLED' | 'NODE_ENV' | 'SOLANA_ENABLED' | 'PINS_ENABLED'>): Features {
  const market = marketEnabled(env);
  // images and polls flip to true when their milestones ship; market/payments are configuration.
  return { images: true, polls: true, market, payments: market && env.MARKET_PAYMENTS_ENABLED, solana: env.SOLANA_ENABLED, pins: env.PINS_ENABLED };
}

/** Level thresholds (stamps on distinct days) for Regular, Local and Legend. */
export function loyaltyThresholds(env: Pick<Env, 'LOYALTY_LEVELS'>): [number, number, number] {
  const [regular, local, legend] = env.LOYALTY_LEVELS.split(',').map(Number);
  return [regular, local, legend];
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
