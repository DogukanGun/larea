#!/bin/sh
set -e
# Apply pending migrations, optionally seed venues, then start the API.
node node_modules/prisma/build/index.js migrate deploy
if [ "${SEED_ON_START:-0}" = "1" ]; then node dist/scripts/seed.js; fi
exec node dist/main.js
