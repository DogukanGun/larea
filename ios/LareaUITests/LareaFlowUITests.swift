import CoreLocation
import XCTest

/// Walks the whole onboarding and chat flow against a local backend running with
/// NODE_ENV=test (age check via the test-only shortcut) and attaches a screenshot of every screen.
@MainActor
final class LareaFlowUITests: XCTestCase {
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSignUpVerifyJoinAndChat() throws {
        // A freshly booted simulator has no location; park it on a real library (or LAREA_TEST_LAT/LNG).
        let bundleForConfig = Bundle(for: LareaFlowUITests.self)
        let lat = Double(bundleForConfig.object(forInfoDictionaryKey: "LareaTestLat") as? String ?? "") ?? 52.5316059
        let lng = Double(bundleForConfig.object(forInfoDictionaryKey: "LareaTestLng") as? String ?? "") ?? 13.3986959
        XCUIDevice.shared.location = XCUILocation(location: CLLocation(latitude: lat, longitude: lng))
        let app = XCUIApplication()
        // Point the app at another backend: build with LAREA_TEST_API_BASE_URL / LAREA_TEST_WS_URL
        // (injected into this bundle's Info.plist), or TEST_RUNNER_LAREA_API_BASE_URL in the environment.
        let bundle = Bundle(for: LareaFlowUITests.self)
        let overrides: [(String, String)] = [("LAREA_API_BASE_URL", "LareaTestAPIBaseURL"), ("LAREA_WS_URL", "LareaTestWSURL")]
        for (envKey, plistKey) in overrides {
            let fromPlist = (bundle.object(forInfoDictionaryKey: plistKey) as? String).flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 }
            if let value = fromPlist ?? ProcessInfo.processInfo.environment[envKey], !value.isEmpty { app.launchEnvironment[envKey] = value }
        }
        print("UI test backend override:", app.launchEnvironment["LAREA_API_BASE_URL"] ?? "none (localhost)")
        // Age check: the backend's test-only shortcut instead of the iOS age-range prompt.
        app.launchArguments += ["-LareaTestAgePass", "1", "-LareaResetState", "1"]
        app.launch()

        snapshot(app, "01-welcome")
        app.buttons["welcome.create"].tap()

        let suffix = String(Int.random(in: 1000...9999))
        let name = "ui_\(suffix)"
        app.textFields["signup.displayName"].tap()
        app.textFields["signup.displayName"].typeText(name)
        app.textFields["signup.email"].tap()
        app.textFields["signup.email"].typeText("ui-\(suffix)@example.test")
        // Validation errors appear only after a first submit attempt.
        app.buttons["signup.submit"].tap()
        snapshot(app, "02-signup-validation")
        app.secureTextFields["signup.password"].tap()
        // iOS 26 offers a generated password in a system sheet; dismiss it and use our own.
        if app.staticTexts["Use Strong Password?"].waitForExistence(timeout: 3) {
            app.buttons["xmark"].tap()
            if !app.keyboards.firstMatch.waitForExistence(timeout: 2) {
                app.secureTextFields["signup.password"].tap()
            }
        }
        app.secureTextFields["signup.password"].typeText("correct-horse-battery")
        snapshot(app, "03-signup-filled")
        app.buttons["signup.submit"].tap()

        XCTAssertTrue(app.staticTexts["Confirm you're 18 or older"].waitForExistence(timeout: 15))
        // iOS 26 asks to save the new password in a system sheet that covers the screen.
        if app.buttons["Not Now"].waitForExistence(timeout: 3) { app.buttons["Not Now"].tap() }
        snapshot(app, "04-verification")
        let confirmAge = app.buttons["verify.start"]
        if !confirmAge.isHittable { app.swipeUp() } // the steps push the button below the fold on small screens
        confirmAge.tap()

        // Location permission persists across app reinstalls on the simulator, so the
        // permission screen may be skipped on a second run.
        let locationTitle = app.staticTexts["Where are you?"]
        let mapRoot = app.descendants(matching: .any).matching(identifier: "nearby.root").firstMatch
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline, !locationTitle.exists, !mapRoot.exists { sleep(1) }
        XCTAssertTrue(locationTitle.exists || mapRoot.exists, "neither the location screen nor the map appeared")
        if locationTitle.exists {
            snapshot(app, "06-location")
            app.buttons["location.allow"].tap()
            let locationAlert = springboard.alerts.firstMatch
            if locationAlert.waitForExistence(timeout: 8) {
                let allow = locationAlert.buttons["Allow While Using App"]
                (allow.exists ? allow : locationAlert.buttons.element(boundBy: 1)).tap()
            }
        }

        // The sheet lists real places nearest first; the first row is the place we are standing at.
        let firstVenue = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'venue.' AND identifier != 'venue.card.join'")).firstMatch
        XCTAssertTrue(firstVenue.waitForExistence(timeout: 150), "the place list did not load")
        sleep(1)
        snapshot(app, "07-map-list")
        firstVenue.tap()
        let joinButton = app.descendants(matching: .any).matching(identifier: "venue.card.join").firstMatch
        if !joinButton.waitForExistence(timeout: 8), firstVenue.exists {
            // A synthesized tap on the panel list is sometimes swallowed; try once more.
            snapshot(app, "07a-after-first-tap")
            firstVenue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        if !joinButton.waitForExistence(timeout: 10) {
            let tree = XCTAttachment(string: app.debugDescription)
            tree.name = "element-tree"
            tree.lifetime = .keepAlways
            add(tree)
            XCTFail("the place card did not open")
        }
        sleep(1)
        snapshot(app, "07b-map-card")
        joinButton.tap()

        // A vertical-axis TextField is exposed as a text view; match on the identifier regardless of type.
        let composer = app.descendants(matching: .any).matching(identifier: "chat.composer").firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 20), "chat did not open")
        sleep(2)
        snapshot(app, "08-chat-empty")
        composer.tap()
        composer.typeText("Anyone want to get food?")
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts["Anyone want to get food?"].waitForExistence(timeout: 15))
        composer.tap()
        composer.typeText("this is damn good")
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts["this is d*** good"].waitForExistence(timeout: 15))
        composer.tap()
        composer.typeText("I know where you live. I'm coming to your house.")
        app.buttons["chat.send"].tap()
        XCTAssertTrue(app.staticTexts["This message doesn't meet our community guidelines."].waitForExistence(timeout: 15))
        sleep(1)
        snapshot(app, "09-chat-messages")

        // Participants: the sheet lists the people in the chat, including us.
        app.buttons["chat.members"].tap()
        XCTAssertTrue(app.buttons["members.done"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 10), "our own name is missing from the members list")
        sleep(1)
        snapshot(app, "09b-members")
        app.buttons["members.done"].tap()

        app.buttons["chat.leave"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "nearby.root").firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Profile"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 10))
        sleep(1)
        snapshot(app, "10-profile")
    }

    private func snapshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
