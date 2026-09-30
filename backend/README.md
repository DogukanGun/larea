# Larea backend

NestJS API and WebSocket server for the Larea location-based chat. PostgreSQL for data, Redis for cache, locks, rate limits and realtime fan-out. No hosted services.

## Requirements

- Node 24 (`.nvmrc`), pnpm 11 via corepack
- Docker (for local Postgres and Redis)
- An OpenAI API key (`OPENAI_API_KEY`) for moderation. It is required in every environment except `NODE_ENV=test`, where a deterministic fake classifier is used instead

## Run locally

```sh
cp .env.example .env            # then edit secrets
docker compose up -d --wait     # Postgres on 5433, Redis on 6380
pnpm install
pnpm prisma:generate
pnpm prisma:migrate             # applies migrations to the dev database
pnpm start:dev                  # http://localhost:3000, docs at /docs
```

Moderator account for the admin endpoints: `SEED_MODERATOR_EMAIL=... SEED_MODERATOR_PASSWORD=... pnpm seed` creates or promotes it. Nothing else is seeded; venues are real places discovered from OpenStreetMap wherever the map is looking. To pre-load a whole city instead of waiting for on-demand discovery: `pnpm build && pnpm discover:area -- --lat 48.1374 --lng 11.5755 --radius 12000 --cafes` (see `../docs/deployment.md`).

## Scripts

| Command | What it does |
|---|---|
| `pnpm test` | unit tests (vitest) |
| `pnpm test:e2e` | end-to-end tests against `larea_test` (migrations applied automatically) |
| `pnpm typecheck` / `pnpm lint` | tsc and oxlint |
| `pnpm openapi` | builds and writes `../docs/api/openapi.json` |
| `pnpm build` / `pnpm start:prod` | production build and start |
| `pnpm solana:validator` / `pnpm solana:setup` / `pnpm solana:faucet` / `pnpm solana:smoke` | local validator, Solana keys/collections/tree/test mints, test funds, a real on-chain round trip (after `pnpm build`; see `../docs/solana.md`) |

## Layout

`src/` is one module per concern: `auth`, `users`, `verification` (platform age signals), `venues`, `media` (photo uploads, sharp pipeline, quarantine), `polls`, `market` (listings, offers, orders, Stripe Connect and webhooks, the USDC rail), `solana` (wallet linking, check-in stamps, tips, perks, SKR rewards, NFT metadata), `loyalty` (levels from stamps), `presence` (join, heartbeat, sweep), `realtime` (WebSocket endpoint and Redis bus), `messages`, `moderation` (OpenAI classifier, rules, strike policy), `enforcement`, `blocks`, `reports`, `admin`, `retention`, `health`. `common/` holds guards, error shape and validation; `infra/` holds Prisma, Redis and logging. `testing/` holds the fake classifier, the fake Overpass, Stripe and Solana clients and the `POST /testing/verify-age` shortcut; it is only loaded when `NODE_ENV=test`.

The realtime protocol is documented in `../docs/realtime-protocol.md`.

## Age assurance

The apps ask the operating system for the user's age range (Apple Declared Age Range on iOS 26+, Google Play Age Signals on Android) and post the answer to `POST /verification/platform` (`platform`, `lowerBound`, `upperBound`, `declaration`). The user passes when the lower bound is 18 or more. The backend stores only the platform, the declaration kind (self, guardian, confirmed) and pass/fail; never an age, birthday or document. No paid identity provider is involved. The signal is attested by the app itself; binding it to a genuine app instance (App Attest / Play Integrity) is a planned hardening step.

## Moderation

Every message and display name goes through OpenAI twice: the free `omni-moderation-latest` endpoint is a hard floor (threats, sexual content involving minors, self-harm, graphic violence block immediately), then `OPENAI_MODEL` (default `gpt-5-nano`) returns a structured verdict (allow / warn / censor / block, severity 0-3, categories, censored text) following the policy in `src/moderation/prompt.ts`. When OpenAI is unreachable the API answers 503 `MODERATION_UNAVAILABLE` and nothing is published.

## Solana dApp Store build

With `SOLANA_ENABLED=1` the backend also serves the Android `solana` flavor: wallets linked with Sign In With Solana, soulbound compressed-NFT check-in stamps that open a place's chat, loyalty levels with a Regulars room, USDC/SKR tips, USDC marketplace payments through an escrow wallet, SKR level rewards and moderator-run perks. Requests from that build carry `X-Larea-Build: solana`; everyone else is unaffected. Setup, configuration and publishing: `../docs/solana.md`.

## Production

The current Hetzner test server and the ship procedure are documented in `../docs/deployment.md`.

`Dockerfile` builds the API; `docker-compose.prod.yml` runs Postgres, Redis, the API and Caddy (automatic HTTPS, WebSocket passthrough):

```sh
cp .env.example .env.production   # NODE_ENV=production, real secrets, OPENAI_API_KEY
DOMAIN=api.example.com POSTGRES_PASSWORD=... docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The container applies migrations on start.
