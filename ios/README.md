# Larea iOS

SwiftUI app, iOS 26+, Swift 6, no third-party dependencies. Project generated from `project.yml` with XcodeGen (`xcodegen generate`).

- Age assurance uses Apple's Declared Age Range API (entitlement `com.apple.developer.declared-age-range`). Device builds need that capability enabled on the App ID `com.dogukangundogan.larea` in the Apple Developer account; the simulator without a signed build reports the prompt as unavailable.
- Backend URL comes from `project.yml` (Debug and Release both point at `https://larea.dogukangundogan.com`). Override at launch with the `LAREA_API_BASE_URL` / `LAREA_WS_URL` environment variables.
- Tests: `xcodebuild -scheme Larea test` (unit) and `xcodebuild -scheme LareaUI ... LAREA_TEST_API_BASE_URL=http://localhost:3000/ LAREA_TEST_WS_URL=ws://localhost:3000/ws test` (UI flow; it also covers replies by long-press and by swipe). The UI flow needs a backend running with `NODE_ENV=test`, because the age step uses the backend's test-only shortcut through the debug launch argument `-LareaTestAgePass 1`.
- Known issue: the UI flow currently stops at the marketplace step, because the backend refuses the simulator's location as mocked when posting a listing ("Mock locations are not allowed"); the chat and reply steps come after it.
