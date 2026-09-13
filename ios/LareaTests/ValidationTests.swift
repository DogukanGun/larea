import XCTest
@testable import Larea

final class ValidationTests: XCTestCase {
    func testEmail() {
        XCTAssertNil(Validation.email("anna@example.com"))
        XCTAssertNotNil(Validation.email(""))
        XCTAssertNotNil(Validation.email("nope"))
        XCTAssertNotNil(Validation.email("a@b"))
    }

    func testPassword() {
        XCTAssertNil(Validation.password("correct-horse-battery"))
        XCTAssertNotNil(Validation.password("short"))
        XCTAssertNotNil(Validation.password(""))
    }

    func testDisplayNameMatchesBackendRule() {
        XCTAssertNil(Validation.displayName("anna_k"))
        XCTAssertNil(Validation.displayName("Anna K."))
        XCTAssertNil(Validation.displayName("Zoë 23"))
        XCTAssertNotNil(Validation.displayName("ab"))
        XCTAssertNotNil(Validation.displayName("-anna"))
        XCTAssertNil(Validation.displayName(" anna "))  // trimmed like the backend
        XCTAssertNotNil(Validation.displayName("anna!"))
        XCTAssertNotNil(Validation.displayName(String(repeating: "a", count: 25)))
    }
}
