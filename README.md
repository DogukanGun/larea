# Larea

Location-based group chat. People who are physically at a predefined place can talk in that place's general chat. Participation requires an authenticated account, a passed 18+ age check, being within 200 m of the venue, and content that passes moderation.

Three independent projects live here; nothing is shared between them:

- `backend/` — NestJS API and WebSocket server (PostgreSQL, Redis).
- `android/` — native Android app (Kotlin, Jetpack Compose), in two flavors: `play` (Play Store) and `solana` (Solana dApp Store, with check-in stamps, stamp-gated chat, loyalty, tips and USDC payments; see `docs/solana.md`).
- `ios/` — native iOS app (Swift, SwiftUI).
- `docs/` — generated OpenAPI file, the realtime protocol description and the Solana build (`solana.md`).
