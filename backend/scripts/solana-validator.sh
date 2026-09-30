#!/bin/sh
# Local Solana test validator with the Metaplex programs Larea needs, cloned from devnet.
# Usage: scripts/solana-validator.sh [ledger dir]   (then: pnpm solana:setup -- --cluster localnet)
set -e
LEDGER="${1:-var/solana-ledger}"
exec solana-test-validator --reset --quiet --ledger "$LEDGER" --url https://api.devnet.solana.com \
  --clone-upgradeable-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY \
  --clone-upgradeable-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d \
  --clone-upgradeable-program mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW \
  --clone-upgradeable-program mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3 \
  --clone-upgradeable-program SysExL2WDyJi9aRZrXorrjHJut3JwHQ7R9bTyctbNNG
