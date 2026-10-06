import XCTest

/// Scenes for the iOS demo video, one test each, recorded with `simctl io recordVideo` around the run.
/// Expects a local backend in development mode on localhost:3001 and the demo account below.
@MainActor
final class DemoTakes: XCTestCase {
    private var springboard: XCUIApplication { XCUIApplication(bundleIdentifier: "com.apple.springboard") }
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["LAREA_API_BASE_URL"] = "http://localhost:3001/"
        app.launchEnvironment["LAREA_WS_URL"] = "ws://localhost:3001/ws"
        app.launch()
    }

    // MARK: helpers

    private func el(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func pause(_ seconds: Double) {
        Thread.sleep(forTimeInterval: seconds)
    }

    /// Types like a person: one character at a time with small, uneven gaps.
    private func type(_ text: String, into element: XCUIElement) {
        for ch in text {
            element.typeText(String(ch))
            Thread.sleep(forTimeInterval: Double.random(in: 0.04...0.13) + (ch == " " ? 0.06 : 0))
        }
    }

    private func tap(_ id: String, timeout: Double = 15, file: StaticString = #filePath, line: UInt = #line) {
        let e = el(id)
        XCTAssertTrue(e.waitForExistence(timeout: timeout), "missing \(id)", file: file, line: line)
        pause(0.5)
        e.tap()
    }

    private func dismissSystemSheets() {
        for label in ["Not Now", "Allow While Using App", "Allow Full Access", "Don’t Allow"] where label != "Don’t Allow" {
            let b = springboard.buttons[label]
            if b.exists { b.tap() }
            let a = app.buttons[label]
            if a.exists { a.tap() }
        }
    }

    /// Picks a photo in the system picker by its position in the grid (the two demo photos come first).
    private func pickPhoto(index: Int) {
        let close = app.buttons["Close"]
        if close.waitForExistence(timeout: 3) { close.tap(); pause(0.6) }
        let grid = app.images.matching(NSPredicate(format: "label BEGINSWITH 'Photo,'"))
        XCTAssertTrue(grid.firstMatch.waitForExistence(timeout: 10), "photo picker did not show photos")
        pause(1.2)
        // The picker runs out of process: its cells report frames but are never "hittable".
        let frame = grid.element(boundBy: index).frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.midX, dy: frame.midY)).tap()
        pause(0.8)
        let done = app.buttons["Done"]
        if done.waitForExistence(timeout: 2), done.isEnabled { done.tap() }
    }

    private func toMap() {
        app.tabBars.buttons["Nearby"].tap()
        XCTAssertTrue(el("nearby.root").waitForExistence(timeout: 15))
    }

    // MARK: setup (not recorded)

    func test00SignIn() throws {
        if el("welcome.signin").waitForExistence(timeout: 5) {
            tap("welcome.signin")
            tap("signin.email")
            el("signin.email").typeText("ios.demo@larea.test")
            tap("signin.password")
            el("signin.password").typeText("larea-demo-2026")
            tap("signin.submit")
        }
        pause(3)
        dismissSystemSheets()
        if el("location.allow").waitForExistence(timeout: 5) {
            el("location.allow").tap()
            let alert = springboard.alerts.firstMatch
            if alert.waitForExistence(timeout: 8) {
                let allow = alert.buttons["Allow While Using App"]
                (allow.exists ? allow : alert.buttons.element(boundBy: 1)).tap()
            }
        }
        XCTAssertTrue(el("nearby.root").waitForExistence(timeout: 30))
    }

    /// Opens the listing form's photo picker and records how it looks to the test (run once).
    func test01ProbePhotoPicker() throws {
        app.tabBars.buttons["Market"].tap()
        tap("market.create")
        tap("market.create.photos")
        pause(1)
        let library = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'library' OR label CONTAINS[c] 'photos'")).firstMatch
        if library.waitForExistence(timeout: 3) { library.tap() }
        pause(3)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "picker-tree"
        tree.lifetime = .keepAlways
        add(tree)
        print("PICKER-TREE-BEGIN\n\(app.debugDescription)\nPICKER-TREE-END")
    }

    // MARK: the take

    /// The whole demo in one run (each test relaunches the app); the edit cuts it into scenes.
    /// Run `node stage.mjs direct` alongside: it answers the photo, votes on the poll, offers on the bike.
    func testFullDemo() throws {
        // 1. The map: real places around you.
        XCTAssertTrue(el("nearby.root").waitForExistence(timeout: 20))
        let library = el("venue.48b7bd75-9eb2-4ef1-83fd-796db0eec347")
        XCTAssertTrue(library.waitForExistence(timeout: 60))
        pause(5)
        print("MARK scene2 \(Date().timeIntervalSince1970)")

        // 2. Join the library's chat.
        library.tap()
        pause(3)
        tap("venue.card.join")
        let composer = el("chat.composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 20))
        pause(4)
        print("MARK scene3 \(Date().timeIntervalSince1970)")

        // 3. A message and a photo.
        composer.tap()
        type("found a quiet corner on the 3rd floor", into: composer)
        pause(0.6)
        tap("chat.send")
        pause(3.5)
        tap("chat.attach")
        tap("chat.attach.library")
        pickPhoto(index: 0) // shelves
        XCTAssertTrue(el("chat.attach.preview").waitForExistence(timeout: 10))
        pause(1.2)
        tap("chat.send")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'chat.image.'")).firstMatch.waitForExistence(timeout: 30))
        pause(5)
        print("MARK scene4 \(Date().timeIntervalSince1970)")

        // 4. A poll; people around vote live.
        tap("chat.attach")
        tap("chat.poll")
        let question = el("poll.question")
        XCTAssertTrue(question.waitForExistence(timeout: 10))
        question.tap()
        type("Coffee break at 4?", into: question)
        for (i, text) in ["Yes", "Later"].enumerated() {
            let option = el("poll.option.\(i)")
            option.tap()
            type(text, into: option)
        }
        pause(0.6)
        tap("poll.submit")
        pause(7) // the others vote
        let mine = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'poll.' AND identifier CONTAINS '.option.'")).firstMatch
        if mine.waitForExistence(timeout: 5) { mine.tap() }
        pause(4)
        print("MARK scene5 \(Date().timeIntervalSince1970)")

        // 5. Moderation and the people here.
        composer.tap()
        type("the wifi in here is shit again", into: composer)
        pause(0.5)
        tap("chat.send")
        pause(5)
        tap("chat.members")
        pause(4)
        tap("members.done")
        pause(2)
        print("MARK scene6 \(Date().timeIntervalSince1970)")

        // 6. Sell something nearby.
        tap("chat.leave")
        pause(2)
        app.tabBars.buttons["Market"].tap()
        XCTAssertTrue(el("market.root").waitForExistence(timeout: 15))
        pause(3.5)
        tap("market.create")
        tap("market.create.photos")
        pause(0.8)
        let fromLibrary = app.buttons["Photo library"]
        XCTAssertTrue(fromLibrary.waitForExistence(timeout: 5))
        fromLibrary.tap()
        pickPhoto(index: 1) // bike
        pause(1)
        let title = el("market.create.title")
        title.tap()
        type("Single-speed city bike", into: title)
        let price = el("market.create.price")
        price.tap()
        type("120", into: price)
        let priceDone = el("market.create.priceDone")
        if priceDone.waitForExistence(timeout: 2) { priceDone.tap() }
        pause(1)
        let submit = el("market.submit")
        if !submit.isHittable { app.swipeUp(velocity: .slow) }
        pause(0.5)
        submit.tap()
        pause(5)
        print("MARK scene7 \(Date().timeIntervalSince1970)")

        // 7. An offer comes in; accept it.
        for _ in 0..<5 where !el("deals.root").exists {
            app.tabBars.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Deals'")).firstMatch.tap()
            _ = el("deals.root").waitForExistence(timeout: 3)
        }
        XCTAssertTrue(el("deals.root").exists)
        // The offer row's identifier hides the button's own, so find it by its title.
        let accept = app.buttons["Accept"].firstMatch
        for _ in 0..<6 where !accept.waitForExistence(timeout: 4) {
            app.swipeDown(velocity: .slow) // pull to refresh
        }
        pause(3.5)
        accept.tap()
        pause(7)
        print("MARK end \(Date().timeIntervalSince1970)")
    }

    /// Scene 5 on its own (the moderator masks only some runs): rejoin the chat, swear, see the people here.
    func testSceneModeration() throws {
        let library = el("venue.48b7bd75-9eb2-4ef1-83fd-796db0eec347")
        XCTAssertTrue(library.waitForExistence(timeout: 60))
        library.tap()
        tap("venue.card.join")
        let composer = el("chat.composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 20))
        pause(3)
        print("MARK go \(Date().timeIntervalSince1970)")
        composer.tap()
        pause(1)
        type("the wifi in here is shit again", into: composer)
        pause(0.5)
        tap("chat.send")
        pause(6)
        tap("chat.members")
        pause(4)
        tap("members.done")
        pause(2)
        tap("chat.leave")
        pause(1)
    }

    private func shot(_ name: String) {
        let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// Checks replies against the local backend: menu, swipe, quote, jump.
    func testReplyCheck() throws {
        let library = el("venue.48b7bd75-9eb2-4ef1-83fd-796db0eec347")
        XCTAssertTrue(library.waitForExistence(timeout: 60))
        library.tap()
        tap("venue.card.join")
        let composer = el("chat.composer")
        XCTAssertTrue(composer.waitForExistence(timeout: 20))
        pause(2)
        let target = app.staticTexts["is the café downstairs open on sundays?"].firstMatch
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        target.press(forDuration: 1.0)
        pause(0.8)
        shot("1-menu")
        XCTAssertTrue(app.buttons["Reply"].waitForExistence(timeout: 5))
        app.buttons["Reply"].tap()
        XCTAssertTrue(el("chat.reply.preview").waitForExistence(timeout: 5))
        pause(0.5)
        type("is it open on saturdays too?", into: composer)
        shot("2-composing")
        tap("chat.send")
        let quote = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'chat.reply.' AND NOT (identifier IN {'chat.reply.preview', 'chat.reply.cancel'})")).firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 20))
        pause(1.5)
        shot("3-sent")
        app.staticTexts["is it open on saturdays too?"].firstMatch.swipeRight()
        XCTAssertTrue(el("chat.reply.preview").waitForExistence(timeout: 5), "swipe did not start a reply")
        pause(0.5)
        shot("4-swipe")
        tap("chat.reply.cancel")
        XCTAssertTrue(el("chat.reply.preview").waitForNonExistence(timeout: 5))
        quote.tap()
        pause(0.4)
        shot("5-jump")
        pause(1.5)
        tap("chat.leave")
    }
}
