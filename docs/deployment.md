# Deployment (Hetzner test server)

- Host: `2.28.123.220` (Hetzner Cloud, Ubuntu 26.04, 2 vCPU / 4 GB). SSH: `ssh hetzner-larea` (key `~/.ssh/hetzner_server`, root, password login disabled, ufw allows 22/80/443).
- Public API: `https://larea.dogukangundogan.com` (alias `https://2-28-123-220.sslip.io`). Caddy terminates TLS and proxies to the API container, including WebSockets on `/ws`.
- Stack: `docker-compose.prod.yml` in `/opt/larea/backend` — Postgres 16, Redis 7, the API image built from `backend/Dockerfile`, Caddy 2. Secrets live in `/opt/larea/backend/.env.production` (never synced from the laptop).
- Runs with `NODE_ENV=production`: real OpenAI moderation (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-nano`), platform age signals, mock locations refused, no `/docs` UI. There are no seeded or synthetic venues; places come from OpenStreetMap on demand.

## Ship a new backend version

```sh
# from the repo root on the laptop
rsync -az --delete --exclude node_modules --exclude dist --exclude '.env*' --exclude 'src/generated' --exclude coverage --exclude .git backend/ hetzner-larea:/opt/larea/backend/
ssh hetzner-larea 'cd /opt/larea/backend && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build'
```

The container runs `prisma migrate deploy` on start. `SEED_ON_START=1` only runs the moderator bootstrap (`SEED_MODERATOR_EMAIL` / `SEED_MODERATOR_PASSWORD`); keep it at `0` after the first run.

## Useful commands on the server

```sh
cd /opt/larea/backend
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
docker compose -f docker-compose.prod.yml --env-file .env.production exec postgres psql -U larea larea
```

## Production settings

`.env.production` holds `NODE_ENV=production`, `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5-nano`, `OVERPASS_CONTACT=dogukangundogan5@gmail.com` and the secrets. The env validation refuses to start without the OpenAI key or with `ALLOW_MOCK_LOCATIONS=1`. One-time activation after the OpenAI cut-over: `/opt/larea/backend/set-openai-key.sh <OPENAI_API_KEY>` writes the key into the staged env file, rebuilds and restarts the API (the container applies the pending migration on start). The moderator account is `dogukangundogan5@gmail.com`; its generated password is in `/root/larea-moderator-password.txt` on the server (mode 600).

## Age assurance on devices

The apps forward the operating system's age range (Apple Declared Age Range, Google Play Age Signals) to `POST /verification/platform`; nothing but platform, declaration kind and pass/fail is stored. iOS device builds need the Declared Age Range capability enabled for the App ID `com.dogukangundogan.larea` in the Apple Developer account (the entitlement is already in `ios/Larea/Larea.entitlements`). On a simulator the prompt reports "not available", so simulator testing uses a local backend started with `NODE_ENV=test` and the debug-only launch argument `-LareaTestAgePass 1`. Known limitation: the signal is attested by the app, not by a server-verified token; App Attest / Play Integrity is the planned hardening.

## Apps

- iOS: both Debug and Release builds use `https://larea.dogukangundogan.com` (see `ios/project.yml`). To run the simulator against a local backend: `SIMCTL_CHILD_LAREA_API_BASE_URL=http://localhost:3000/ SIMCTL_CHILD_LAREA_WS_URL=ws://localhost:3000/ws xcrun simctl launch <udid> com.dogukangundogan.larea`. The UI flow test can target any backend: `xcodebuild -scheme LareaUI ... LAREA_TEST_API_BASE_URL=https://host/ LAREA_TEST_WS_URL=wss://host/ws test`.
- Android: the release build type uses the server; the debug build type keeps `10.0.2.2:3000` (local backend from the emulator). See `android/app/build.gradle.kts`.
- Real iPhone: open `ios/Larea.xcodeproj` in Xcode, select your team under Signing & Capabilities (the Declared Age Range capability must be enabled on the App ID), and run on the device. Places are discovered around wherever the phone is.

## Uploads (chat photos, listing images)

Photos are uploaded to `POST /uploads`, re-encoded with `sharp` (EXIF/GPS stripped, max `MEDIA_MAX_PX` 1600 px, 400 px thumbnail) and written to the `uploads` volume (`MEDIA_DIR=/data/uploads` in the backend container, mounted read-only into Caddy at `/srv/media`). Caddy serves `/media/<id>.jpg` and `/media/<id>_thumb.jpg` straight from the volume with `Cache-Control: immutable`; the API only serves that path in development. Ids are random 128-bit values, there is no directory listing, and hidden or purged content loses its files (hidden photos move to `quarantine/` for moderator review). The upload route is the only one Caddy allows a large body (12 MB; `MEDIA_MAX_BYTES` 10 MB in the API). Uploads are refused with 507 `STORAGE_FULL` when the volume has less than `MEDIA_DISK_RESERVE_BYTES` free. Every photo goes through OpenAI moderation (multimodal floor plus the vision verdict; fail closed), and Larea allows no nudity at all.

First deploy of this version creates the `larea-prod_uploads` volume; check ownership with `docker compose … exec backend ls -ld /data/uploads/public` (owner `app`; fix a root-owned volume once with `docker compose … run --rm --user root backend chown -R 10001 /data/uploads`). Back the volume up together with Postgres, e.g. nightly: `docker run --rm -v larea-prod_uploads:/data:ro -v /var/backups/larea:/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .`.

## Marketplace

Neighbours sell items (`OFFER`) or ask for paid help (`REQUEST`) under `/market/*`. A listing is created at the caller's current fix (checked like a chat join: no simulated fixes in production, plausible movement, accuracy ≤ `MAX_ACCURACY_M`) and everyone else only ever sees the centre of its ~150 m geohash cell and distances rounded to 50 m. Listings are visible and can be dealt with within `MARKET_RADIUS_M` (2 km) of the caller; owners and people with an offer keep access from anywhere. Text and photos go through moderation (fail closed; prohibited items and off-platform payment nudges are blocked), reports on listings work like reports on messages (`POST /market/listings/:id/reports`, removal at `REPORT_AUTO_HIDE_THRESHOLD`, moderator actions `HIDE_CONTENT` / `MUTE` / `SUSPEND`). Offers expire after `MARKET_OFFER_TTL_HOURS`, listings after `MARKET_LISTING_TTL_DAYS`, and closed listings are purged `MARKET_LISTING_PURGE_DAYS` later with their photos (a 15-minute sweep and the retention job). Switches and limits: `MARKET_ENABLED` (default on outside production, so set `MARKET_ENABLED=1` in `.env.production`), `MARKET_PAYMENTS_ENABLED` (Stripe, see below), `MARKET_MIN_PRICE_CENTS`/`MARKET_MAX_PRICE_CENTS`, `MARKET_MAX_IMAGES`, `MARKET_MIN_ACCOUNT_AGE_HOURS` (new accounts wait 24 h before trading), `MARKET_FEE_PERCENT`/`MARKET_FEE_MIN_CENTS`. The apps read `features.market` from `GET /me` and `GET /market/config`.

## Real places (OpenStreetMap)

Venues are discovered on demand from the Overpass API (`OVERPASS_URL`, default public instance `overpass-api.de`) and cached per geohash cell (~0.8 km x 0.6 km at Munich's latitude) for `OSM_CACHE_TTL_SEC` (24 h). The public instance is rate-limited (about 10k queries/day, a few in flight); for production point `OVERPASS_URL` at a paid or self-hosted Overpass instance. When the primary instance fails, the mirrors in `OVERPASS_FALLBACK_URLS` (comma-separated, default `overpass.kumi.systems`) are tried next; requests run one at a time per API instance and back off on 429/504. Place data must be attributed: the API returns `attribution: "Place data © OpenStreetMap contributors"` and the apps show it. Tests use a deterministic fake Overpass client (`backend/src/testing/`), never the public instance.

### Where places come from: the map viewport, not just the phone

`GET /venues/nearby` takes the phone's fix (`lat`, `lng`, `accuracy`) and, optionally, the map viewport (`viewLat`, `viewLng`, `viewRadiusM` = half the visible width; all three together). Places are returned and discovered around the viewport, so a user can browse the whole city; distances, the `eligible` flag and the sort order are always measured from the fix. Without a viewport the fix is used with `DISCOVERY_RADIUS_M` (the Android app still works this way).

- Discovery tiers: the requested radius is rounded up to one of three tiers, neighbourhood (`DISCOVERY_RADIUS_M`, 1.5 km), district (their geometric mean, ~4.2 km) and city (`DISCOVERY_MAX_RADIUS_M`, 12 km). One run fetches landmarks and parks for the whole tier and flags every cell inside it, so zooming out over Munich costs two Overpass queries, not hundreds. Viewports wider than the city tier are capped to it.
- Cafés are dense: they are only discovered within 700 m of the viewport centre and only returned while `viewRadiusM <= DISCOVERY_RADIUS_M` (zoomed in). The app says "Zoom in to see cafés" at wider zooms.
- At most `NEARBY_MAX_VENUES` (150) places closest to the viewport centre are returned.

### Pre-loading a city

On-demand discovery fills the map piece by piece as people look around. To make a whole city complete from the first look, run the warm-up once on the server (it upserts real OSM places and flags the covered cells for `--ttl-days`, default 30; safe to re-run):

```sh
cd /opt/larea/backend
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend \
  node dist/scripts/discover-area.js --lat 48.1374 --lng 11.5755 --radius 12000 --cafes --ttl-days 30
```

The Munich run takes a few minutes on the public instance (three city-wide queries with a 180 s server timeout). Locally: `pnpm build && pnpm discover:area -- --lat 48.1374 --lng 11.5755 --radius 12000 --cafes`. Any city works: pass its centre and a radius that covers it (max 50 km).
