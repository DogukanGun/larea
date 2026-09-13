# Larea Android

Native Android client: Kotlin, Jetpack Compose (Material 3), Hilt, Retrofit + OkHttp + kotlinx.serialization, DataStore with a Keystore-encrypted refresh token, platform `LocationManager` (no Play Services), OkHttp WebSocket for realtime. minSdk 26, targetSdk 36, compileSdk 37.

## Build and run

```sh
./gradlew :app:assembleDebug        # uses the JDK from Android Studio (JAVA_HOME) and the SDK in local.properties
./gradlew :app:testDebugUnitTest    # JVM unit tests (event parsing, error mapping, WebSocket client)
```

The debug build talks to the backend on the host machine through the emulator alias `10.0.2.2:3000` (see `app/build.gradle.kts`). Start the backend with `pnpm start:dev` in `../backend`.

## Trying the flow on an emulator

1. Park the emulator on a real place: `adb emu geo fix 13.4132 52.5219` (longitude first; Berlin Alexanderplatz).
2. Sign up, pass the age check (see "Pending: age assurance" below; the old web flow no longer exists on the backend), allow precise location.
3. Nearby places show the "Nearby" badge; tap to join and chat.
4. Move away: `adb emu geo fix 13.4132 52.5265` (about 500 m north). After two heartbeats (~50 s) the app shows the removal dialog.

## Layout

`core/` (network, auth, realtime, location), `feature/` (auth, verification, location, nearby, chat, settings), `ui/` (theme, navigation gate, shared components), `di/` (Hilt module). The realtime protocol is described in `../docs/realtime-protocol.md`.

## Pending: map home screen

The backend's `/venues/nearby` now returns real places from OpenStreetMap with `category`, `address`, `lat`, `lng`, `distanceM` and an `attribution` string. It also accepts the map viewport (`viewLat`, `viewLng`, `viewRadiusM`) so places are fetched for wherever the map is looking, not only around the phone; the Android client does not send it yet and therefore only sees places within 1.5 km of the device. The Android home screen still shows the old list and must be rebuilt as a map (osmdroid, open source) mirroring the iOS `NearbyView`, sending the viewport on camera changes as the iOS `NearbyViewModel.mapMoved` does.

## Pending: age assurance

The age check must use the Play Age Signals API (`com.google.android.play:age-signals`) and post the result to `POST /verification/platform` (`platform: "google"`, `lowerBound`, `upperBound`, `declaration`). The old web-based verification screen is obsolete.
