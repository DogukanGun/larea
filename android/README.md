# Larea Android

Native Android client, feature for feature the same app as `../ios`: Kotlin, Jetpack Compose (Material 3 with the Larea brand theme), Hilt, Retrofit + OkHttp + kotlinx.serialization, DataStore with a Keystore-encrypted refresh token, the platform `LocationManager` (no Play Services location), OkHttp WebSocket for realtime, MapLibre Native with OpenFreeMap tiles for the maps, Coil for images. minSdk 26, targetSdk 36, compileSdk 37.

## Build and run

Two product flavors share everything under `src/main`:

- `play` is the Play Store app (`com.dogukangundogan.larea`), the same as iOS.
- `solana` is the Solana dApp Store app (`com.dogukangundogan.larea.solana`, installable side by side). It adds wallet, check-in stamps, stamp-gated chat, loyalty levels and the Regulars room, tips, USDC deals, perks and SKR rewards (`src/solana`, see `../docs/solana.md`).

Shared screens only talk to the `SolanaUi` interface. The play flavor binds a no-op, so the Play APK carries no Solana code.

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:assemblePlayDebug                   # debug build → http://10.0.2.2:3000 (the host machine)
./gradlew :app:assembleSolanaDebug -Plarea.devHost=10.0.2.2:3001   # dApp Store flavor; devHost when port 3000 is taken on the host
./gradlew :app:testPlayDebugUnitTest :app:testSolanaDebugUnitTest   # JVM + Robolectric unit tests (mirror ios/LareaTests)
```

Release builds talk to `https://larea.dogukangundogan.com` unless `-Plarea.releaseHost=<host>` points them at another backend, such as the demo API from `../docs/deployment.md`, and are signed from `android/keystore.properties` (gitignored; `storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Without that file they come out unsigned. Keep the keystore safe: the dApp Store listing is tied to it.

```sh
./gradlew :app:assembleSolanaRelease   # → app/build/outputs/apk/solana/release/app-solana-release.apk (published as larea-solana.apk)
./gradlew :app:assembleSolanaRelease -Plarea.releaseHost=demo-larea.2-28-123-220.sslip.io   # the same, against the demo API
```

Start the backend with `NODE_ENV=test MARKET_PAYMENTS_ENABLED=1 MEDIA_DISK_RESERVE_BYTES=0 pnpm start:dev` in `../backend` (add `PORT=3001 PUBLIC_URL=http://localhost:3001` when you move it). Media URLs the local backend announces as `localhost` are rewritten to the emulator's host alias automatically (`MediaUrls`).

Debug-only launch extras (the counterparts of the iOS `-Larea…` launch arguments): `LareaTestAgePass` (age check through the backend's test-only shortcut), `LareaTestSeedImage` ("Use test image" in photo menus), `LareaResetState` (sign out on launch):

```sh
adb shell am start -n com.dogukangundogan.larea/com.larea.app.MainActivity   # .solana for the dApp Store flavor --ez LareaTestAgePass true --ez LareaTestSeedImage true
```

## UI flow test

`app/src/androidTest/.../LareaFlowTest.kt` ports `ios/LareaUITests/LareaFlowUITests.swift`: sign up, age check, post and edit a listing, join the nearest place, send text, a photo and a poll, check masking and blocking, members, leave, profile, payouts, my listings. It feeds a fix at a Berlin library through test location providers (the dev backend accepts mocked fixes) and saves screenshots to the app's external files dir under `flow/`.

```sh
./gradlew :app:connectedPlayDebugAndroidTest -Plarea.devHost=10.0.2.2:3001 -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true
adb pull /sdcard/Android/data/com.dogukangundogan.larea/files/flow
```

`app/src/androidTestSolana/.../SolanaFlowTest.kt` covers the dApp Store flavor without a wallet app: the Profile wallet section, "Check in & join", and the answer when no wallet is linked (`connectedSolanaDebugAndroidTest`, backend with `SOLANA_ENABLED=1`). `LareaFlowTest` skips itself in that flavor.

The backend's fake place discovery caches places per map cell for 24 h, so after trying other locations on the same dev database the test may find no place within 200 m; start from a fresh dev database (or wait a day).

## Layout

- `core/`: network (Retrofit API, models, lenient JSON), auth, realtime, location, media (on-device downsizing and upload), age (Play Age Signals), format (money, dates, validation), browser (Custom Tabs).
- `feature/`: auth, verification, location, nearby (map home), chat, market, deals, payouts, profile, suspended.
- `src/solana/`: the dApp Store flavor (wallet adapter, check-in, loyalty, tips, USDC payments, perks); `src/play/` binds the no-op `SolanaUi`.
- `ui/`: theme (brand tokens, Nunito as the rounded display face), components (the port of `ios/Larea/DesignSystem`), map (MapLibre wrapper with Compose overlays), navigation (tabs, routes, deep links, the app router that keeps the chat session alive across tabs).

The realtime protocol is described in `../docs/realtime-protocol.md`.

## Decisions

- **Maps:** MapLibre Native (the `android-sdk-opengl` build: the plain artifact is Vulkan-only since 13.x) with OpenFreeMap vector tiles, which are free and need no key; built-in points of interest are hidden like on iOS. Point `LIGHT_STYLE`/`DARK_STYLE` in `ui/map/LareaMap.kt` at your own tile server for production traffic.
- **Age check:** Play Age Signals where Google shares an age range (`POST /verification/platform`, `platform: "google"`). Where Google has no answer (outside the US states that require it, no Play Store), the user confirms 18+ themselves (`platform: "self"`, stored as provider `self-declared`). That backend path is local only until it is deployed.
- **Payments:** Stripe onboarding and Checkout open in a Custom Tab; the backend redirects back through `larea://market/...`, and closing the tab reloads the screen. No Stripe SDK.
- **Kotlin 2.4:** the root `build.gradle.kts` puts the Kotlin 2.4 Gradle plugin on the buildscript classpath. AGP 9.4 bundles 2.2, but current Coil and Mobile Wallet Adapter 2.2 are built with 2.4.
- **Solana:** Mobile Wallet Adapter (`mobile-wallet-adapter-clientlib-ktx`, solana flavor only). The backend builds every transaction; the app asks the wallet to sign and never holds a key.

## Known gaps

- Copy is English only and lives in the Compose code (as on iOS); there are no string resources to translate yet.
- Debug builds start slowly on the emulator (8–12 s cold start, class verification of unminified Compose); `MainThreadWatchdog` logs any main-thread stall over 2 s in debug builds.
- Real Stripe (test keys) has not been exercised from Android; locally the fake Stripe client's links do not resolve, so a paid order cannot be completed end to end on the emulator.
