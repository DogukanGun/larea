import XCTest

/// Proves the backend override reaches the app: with an unreachable backend, signing in
/// must fail with the network error rather than a credentials error.
@MainActor
final class BackendOverrideUITests: XCTestCase {
    /// Values injected into this bundle's Info.plist by the LAREA_TEST_* build settings.
    static func plistOverride(_ key: String) -> String? {
        (Bundle(for: BackendOverrideUITests.self).object(forInfoDictionaryKey: key) as? String)
            .flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 }
    }

    func testLaunchEnvironmentOverridesBackend() {
        let app = XCUIApplication()
        app.launchEnvironment["LAREA_API_BASE_URL"] = "https://127.0.0.1:9/"
        app.launchEnvironment["LAREA_WS_URL"] = "wss://127.0.0.1:9/ws"
        expectNetworkError(app)
    }

    func testPlistOverrideIsReadable() throws {
        let value = Self.plistOverride("LareaTestAPIBaseURL")
        // Only meaningful when the override points at the unreachable sentinel; a real backend
        // (the flow test's usual setup) would sign in instead of failing.
        try XCTSkipIf(value != "https://127.0.0.1:9/", "build with LAREA_TEST_API_BASE_URL=https://127.0.0.1:9/ to exercise this test")
        let app = XCUIApplication()
        app.launchEnvironment["LAREA_API_BASE_URL"] = value!
        expectNetworkError(app)
    }

    private func expectNetworkError(_ app: XCUIApplication) {
        app.launch()
        app.buttons["welcome.signin"].tap()
        app.textFields["signin.email"].tap()
        app.textFields["signin.email"].typeText("nobody@example.test")
        app.secureTextFields["signin.password"].tap()
        app.secureTextFields["signin.password"].typeText("whatever-password")
        app.buttons["signin.submit"].tap()
        let networkError = app.staticTexts["Can't reach Larea. Check your connection and try again."]
        XCTAssertTrue(networkError.waitForExistence(timeout: 30), "the app ignored LAREA_API_BASE_URL")
    }
}
