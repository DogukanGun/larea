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
