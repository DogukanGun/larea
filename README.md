# Larea

Location-based group chat. People who are physically at a predefined place can talk in that place's general chat. Participation requires an authenticated account, a passed 18+ age check, being within 200 m of the venue, and content that passes moderation.

## Try it

**Android (Solana build, devnet):** download the signed APK from the [latest release](https://github.com/DogukanGun/larea/releases/latest) ([direct link](https://github.com/DogukanGun/larea/releases/latest/download/larea-solana.apk)) and follow the [tester guide](https://web-steel-one-6p2b40mh9g.vercel.app/try): install, switch your wallet (Seeker wallet, Phantom or Solflare) to devnet, connect it in Profile → Wallet, then check in at any real place near you, chat, reply, tip and trade in USDC. The APK talks to the test server at `larea.dogukangundogan.com`.

## Repository

Three independent projects live here; nothing is shared between them:

- `backend/` — NestJS API and WebSocket server (PostgreSQL, Redis).
- `android/` — native Android app (Kotlin, Jetpack Compose), in two flavors: `play` (Play Store) and `solana` (Solana dApp Store, with check-in stamps, stamp-gated chat, loyalty, tips and USDC payments; see `docs/solana.md`).
- `ios/` — native iOS app (Swift, SwiftUI).
- `web/` — the Larea website (Next.js, deploys on Vercel): landing page, privacy policy, terms, support, imprint.
- `docs/` — generated OpenAPI file, the realtime protocol description and the Solana build (`solana.md`).

## Larea on Solana Mobile (Clock In hackathon)

The Solana build of the Android app turns being somewhere into something you own. Checking in at a place mints a soulbound stamp into your wallet, and that stamp is what opens the place's chat for the next 24 hours. Stamps add up to levels with badge NFTs, a Regulars-only room and SKR rewards; tips in USDC or SKR go wallet to wallet; the neighbourhood marketplace settles in USDC through escrow. The wallet signs everything, Larea never holds a key. Details and the on-chain design are in `docs/solana.md`.

### Try it in five minutes

1. An Android phone (a Seeker, or any phone on Android 8+) with a Solana wallet switched to **devnet**: the Seeker wallet, Phantom or Solflare. Sideloading needs "Install unknown apps" enabled for your browser.
2. Install `larea-solana.apk` from the [latest release](https://github.com/DogukanGun/larea/releases/latest), or follow the [tester guide](https://web-steel-one-6p2b40mh9g.vercel.app/try).
3. Create an account, confirm you are 18+, allow precise location.
4. **Profile → Connect wallet.** Approve the sign-in. The backend sends your wallet a welcome gift of devnet SOL, test USDC and test SKR, so you never need a faucet.
5. **Nearby → pick the place you are at → Check in & join.** Approve the stamp mint in your wallet. The stamp lands in a few seconds, the chat opens, and **Profile → My stamps** shows it. Keep checking in and you level up: Regulars get a badge NFT, their own room and an SKR reward.
6. In the chat, **long-press a message → Tip** to send USDC or SKR to its author. Post a listing under Market to see a USDC price.

Places are real OpenStreetMap places around wherever you are, so this works in any city. The release APK talks to the test server, which refuses simulated locations, so use a real phone. To test on an emulator, build against the demo API instead (`./gradlew :app:assembleSolanaRelease -Plarea.releaseHost=demo-larea.2-28-123-220.sslip.io`, see `docs/deployment.md`) and set a location under Extended controls › Location.

### What is on chain (devnet)

| | Address |
|---|---|
| Stamp tree (Bubblegum V2) | `6qmmN4AZECg8HigugLwN4xNWykx7fK4uwE63Wo1Kc452` |
| "Larea Stamps" collection (mpl-core, soulbound) | `CLbqZ6WE4NYTvDXwHCwAHNc7McXaoSgAYCAvPXs7F312` |
| "Larea Levels" collection | `5b2xq2HNP45vG5m9zsQMoFibBhL5fbTbPmgqFnhCQgDP` |
| Authority (co-signs mints, mints test tokens) | `35gr9WFLDkGZN3fdhY5WUw2LpYuB2bCKZ591qVFauZQb` |
| Test USDC / SKR mints | `9EFuxbsS8hwNHiQPafSM1hGdKvoNkpgmA4Ud4ZHsTWQ8` / `9pGRw8LxFTJ4MdxzGnMKfMd9VTX8iJK8QUNhcezymAhp` |

Example transactions from `pnpm solana:smoke` (open on explorer.solana.com with `?cluster=devnet`): stamp and level badge mint `22YpojaEnDgNr5wZv2BntvxhHAE43AwFvkyJNL5PnNYGJ7M2ZM6vrL4FsngRd9YAxAzqozd8eeKArmrUEJkjQ7Qi`, USDC tip `3AHCU6EXRAbPZHEPetPEHy7We7gw6g6Cv8gmtbBhohbfZZ53G8zzV8E4XDXEViq5JM6e5n2ZkNRiDEVZvmeuantP`, escrow payment `33FNvfQV3w2HzPSQwRwMbHe4SdpZqMEg2UqAqn4TRLXUvpd3X6mNPhUHey7kbekAbeAhAF9LZEK16bdiHGzZLzMk`, SKR reward `41HQdXhque3ZxEfqpRvBRqWuft2XrUmVJUxnpnkgs8ZPNr29Sikeu9KWYD3fUDDWdrGoGoJ6RB9zj55yLCTsGjYh`.

### Where to look in the code

- `android/app/src/solana/` — the dApp Store flavor: Mobile Wallet Adapter and Sign In With Solana (`WalletAdapter.kt`), check-in and stamp signing (`StampFlow.kt`), tips, USDC payments, loyalty and perks.
- `backend/src/solana/` — wallet linking, stamp mints, tips, custody transfers, SKR rewards, perks, NFT metadata; `real-solana.client.ts` builds every transaction with umi and Metaplex, `siws.ts` verifies sign-ins.
- `backend/src/scripts/solana-*.ts` — cluster setup (keys, collections, tree, test mints), faucet, and the on-chain smoke test.
- `docs/solana.md` — feature list, transaction model, configuration, dApp Store publishing.

### Run it yourself

Backend: `backend/README.md` (Docker Postgres and Redis, `pnpm start:dev`), then `docs/solana.md` for a local validator or devnet (`pnpm solana:setup`). Android: `android/README.md` (`./gradlew :app:installSolanaDebug`), with Solana Mobile's open-source fake wallet on an emulator.

Website: https://web-steel-one-6p2b40mh9g.vercel.app · Colosseum project page: https://colosseum.com/arena/projects/neighborhood
