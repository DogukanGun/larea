# Larea

Location-based group chat. People who are physically at a predefined place can talk in that place's general chat. Participation requires an authenticated account, a passed 18+ age check, being within 200 m of the venue, and content that passes moderation.

Three independent projects live here; nothing is shared between them:

- `backend/` — NestJS API and WebSocket server (PostgreSQL, Redis).
- `android/` — native Android app (Kotlin, Jetpack Compose).
- `ios/` — native iOS app (Swift, SwiftUI).
- `docs/` — generated OpenAPI file and the realtime protocol description.
