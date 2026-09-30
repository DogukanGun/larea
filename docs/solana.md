# Larea on Solana (dApp Store build)

The Android app has two flavors. `play` is the Play Store app, the same as iOS. `solana` is published to the Solana dApp Store and adds the "Neighborhood" features: proof of presence, stamp-gated chat, loyalty, tips and USDC payments.

Both flavors use the same backend, the same accounts (email + 18+ check) and the same place chats. Everything Solana-specific is switched on per request: the Solana build sends `X-Larea-Build: solana` on REST and on the WebSocket upgrade. Other clients see a few extra fields they ignore and behave exactly as before.

## What the Solana build adds

| Feature | How it works |
|---|---|
| **Wallet** | Profile → Connect wallet runs Mobile Wallet Adapter Sign In With Solana against a one-time nonce (`POST /solana/wallet/challenge`, `POST /solana/wallet`). The backend verifies the ed25519 signature. Each account has one wallet and each wallet one account. |
| **Check-in stamps** | "Check in & join" on a place card: `POST /venues/:id/checkin` runs the same location checks as joining (200 m, accuracy, no mock locations, plausible movement). It then returns a Bubblegum V2 `mintV2` into the soulbound "Larea Stamps" collection, with the user's wallet as fee payer, already co-signed by Larea as tree and collection authority. The wallet signs it and `POST /solana/stamps/:id/submit` sends it. `…/confirm {signature}` is available for wallets that send it themselves. One stamp per place per UTC day. |
| **Stamp-gated chat** | For Solana-build requests, `POST /venues/:id/join` needs a confirmed stamp for that place from the last 24 h (403 `STAMP_REQUIRED`). Play and iOS users keep joining by location alone and share the same rooms. |
| **Loyalty levels** | Confirmed stamps per place: Visitor 1, Regular 5, Local 15, Legend 40 (`LOYALTY_LEVELS`). The check-in that reaches Regular or above also mints a soulbound badge into "Larea Levels" in the same transaction. Messages carry `authorLevel`, and the Solana build shows a badge. |
| **Regulars room** | Each place has a second room for Regular+. It is sent with `room: "REGULARS"`, read with `?room=REGULARS`, and fanned out only to Regulars on the Solana build. |
| **Level-gated polls** | In the Solana build, starting a poll needs Regular (403 `LEVEL_REQUIRED`). |
| **Tips** | Long-press a message → Tip. `POST /venues/:id/tips {toUserId, token: USDC\|SKR, amount}` returns an SPL `transferChecked` from the sender's wallet. It creates the recipient's token account when needed and adds a `larea:tip:<id>` memo; the sender pays the fee. Once confirmed, a `TIP` message ("anna tipped ben 2 USDC") is posted to the place's main chat. |
| **Market in USDC** | A listing posted from the Solana build by someone with a wallet is priced in USDC (`paymentRail: SOLANA_USDC`, `currency: "usdc"`). Offers on it need the Solana build and a wallet. The buyer pays the full amount into Larea's escrow wallet (`POST /market/orders/:id/solana/pay`, then `…/solana/submit`). The handover code releases the amount minus the fee from escrow to the seller's wallet. Cancelling, auto-refunds and moderator refunds send it back to the buyer. A payment that lands after a cancel is refunded. |
| **SKR level rewards** | Reaching a level pays `SKR_LEVEL_REWARD` SKR from the rewards wallet, once per level and place. Failed payouts are retried. |
| **Perks** | Moderators run perks at a place for holders of a level: `POST /admin/perks {venueId, kind: NOTICE\|SKR_DROP, title, description, minLevel, amount?, maxClaims?, startsAt?, endsAt}`, plus `GET /admin/perks` and `DELETE /admin/perks/:id`. Holders see them on the place card and in chat. Each holder claims an SKR drop once (`POST /solana/perks/:id/claim`). |

Public NFT metadata (JSON and SVG images) is served under `/solana/metadata/…`; the stamps' and collections' `uri` point there (`SOLANA_METADATA_URL`).

## How transactions are built

The backend builds every transaction a user signs, and stores the sha256 of its message. A signed transaction is accepted only when its message is identical. A confirmation is accepted only when the landed transaction's message is identical too. The app never builds transactions itself and only needs base64/base58 on top of Mobile Wallet Adapter.

- **The user signs and pays the fee:** stamp mints (Larea co-signs as tree/collection authority), tips, and market payments into escrow.
- **Larea signs and pays the fee (custody wallets):** payouts and refunds from `escrow`, and SKR rewards and drops from `rewards`.
- The app uses MWA `signTransactions` and the backend sends the result. This works the same on a local validator, devnet and mainnet. The `confirm` endpoints accept a signature from wallets that sent the transaction themselves.
- Pending check-ins, tips and payments that the app never reports back are settled by sweepers. Solana items are swept every 30 s; USDC market payments are settled by the market sweep.

Stamps are soulbound: the collections have the `BubblegumV2` plugin plus a permanent frozen `PermanentFreezeDelegate`, so moving a stamp fails. The backend's stamp table is therefore the exact record of what each wallet holds. When `SOLANA_DAS_URL` points at a DAS-capable RPC, "My stamps" also checks each stamp with `getAssetsByOwner`.

## Configuration (`backend/.env`)

| Variable | Meaning |
|---|---|
| `SOLANA_ENABLED` | `1` turns the Solana endpoints and the stamp gate on. |
| `SOLANA_CLUSTER` | `localnet`, `devnet` or `mainnet`. |
| `SOLANA_RPC_URL` / `SOLANA_DAS_URL` | RPC endpoint; optional DAS RPC for the ownership cross-check. |
| `SOLANA_AUTHORITY_SECRET` / `SOLANA_ESCROW_SECRET` / `SOLANA_REWARDS_SECRET` | Base58 secret keys of the tree/collection authority and the two custody wallets. Written by `pnpm solana:setup` and never committed. |
| `SOLANA_STAMP_TREE`, `SOLANA_STAMP_COLLECTION`, `SOLANA_LEVEL_COLLECTION` | Bubblegum V2 tree and the two soulbound mpl-core collections. |
| `USDC_MINT`, `SKR_MINT` | Token mints. Localnet and devnet use test mints created by the setup script. Mainnet uses real USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) and the real SKR mint. |
| `SOLANA_METADATA_URL` | Public base for NFT metadata; defaults to `${PUBLIC_URL}/solana/metadata`. |
| `LOYALTY_LEVELS` | Stamps for Regular, Local and Legend (default `5,15,40`). |
| `SKR_LEVEL_REWARD` | SKR per level reached (default 5, 0 = off). |
| `SOLANA_PENDING_TTL_SEC` | How long a prepared transaction may take to be signed (default 600). |

## Local setup

Requires the Solana CLI (`solana-test-validator`).

```sh
cd backend
pnpm solana:validator                     # local validator that clones Bubblegum, Core, compression, noop and system-extras from devnet
pnpm build
pnpm solana:setup --cluster localnet   # keypairs, soulbound collections, tree, test USDC/SKR mints → .env
pnpm solana:faucet --to <wallet address> --sol 1 --usdc 100 --skr 100
pnpm solana:smoke                         # real stamp + level badge, USDC tip, escrow payment and payout, SKR reward
```

On devnet, use `pnpm solana:setup --cluster devnet`. Devnet airdrops are rate-limited: when one fails, fund the printed authority address at faucet.solana.com and run the script again. It is idempotent and keeps whatever it already created.

For the emulator, install Solana Mobile's open source `fakewallet` (from `solana-mobile/mobile-wallet-adapter`) or any MWA wallet, then build the app with `./gradlew :app:installSolanaDebug -Plarea.devHost=10.0.2.2:3001`.

## Tests

- **Backend:** `pnpm test` and `pnpm test:e2e` use `FakeSolanaClient` (`src/testing/`). The Solana suites are `test/solana-{wallet,stamps,loyalty,tips,market,perks}.e2e-spec.ts`.
- **Real chain:** `pnpm solana:smoke` runs against whatever cluster `.env` points at.
- **Android:**
  - `./gradlew :app:testPlayDebugUnitTest :app:testSolanaDebugUnitTest` for the unit tests.
  - `connectedSolanaDebugAndroidTest` runs `SolanaFlowTest` (no wallet app needed: wallet section, "Check in & join", wallet-required answer).
  - `connectedPlayDebugAndroidTest` runs the full `LareaFlowTest`.

## Publishing to the Solana dApp Store

The dApp Store publishes signed release APKs through the `dapp-store` CLI (`@solana-mobile/dapp-store-cli`) and an on-chain publisher / app / release NFT.

1. Build a release APK of the Solana flavor: `./gradlew :app:assembleSolanaRelease`. It needs a release signing config. Use a key that is **different** from the Play upload key; the dApp Store expects its own signing key.
2. Package id: `com.dogukangundogan.larea.solana`. It installs side by side with the Play build.
3. `npx @solana-mobile/dapp-store-cli init`, then fill `config.yaml` (publisher, app, release: name, descriptions, icon, screenshots, the APK path, "testing instructions"), then `… create publisher` / `create app` / `create release` and `publish submit`. This mints the NFTs from a funded publisher keypair, on mainnet.
4. Point the build at mainnet first:
   - `SOLANA_CLUSTER=mainnet`, a paid RPC with DAS;
   - the real USDC and SKR mints;
   - a new tree and collections from `solana:setup`;
   - funded custody wallets.

Publishing is left to you. None of it has been run.

## Before real money

- The escrow and rewards wallets are hot keys in the server's environment. That is fine on devnet, but mainnet needs proper key management (an HSM/KMS or multisig), balance alerts and limits.
- USDC listings keep the market's daily volume caps and fees (`MARKET_*`); the fee stays in escrow.
- Mainnet SKR rewards and drops pay out real tokens: fund the rewards wallet deliberately and watch it.
