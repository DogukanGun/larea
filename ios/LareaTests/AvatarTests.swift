import XCTest
@testable import Larea

final class AvatarTests: XCTestCase {
    func testColorIsStableForTheSameSeed() {
        XCTAssertEqual(Avatar.colorIndex(for: "user-1"), Avatar.colorIndex(for: "user-1"))
        XCTAssertEqual(stableHash("larea"), stableHash("larea"))
    }

    func testColorsSpreadAcrossPalette() {
        let indices = Set((0..<200).map { Avatar.colorIndex(for: "user-\($0)") })
        XCTAssertEqual(indices.count, Avatar.palette.count)
    }

    func testInitials() {
        XCTAssertEqual(Avatar.initials(for: "anna_k"), "AK")
        XCTAssertEqual(Avatar.initials(for: "Ben"), "B")
        XCTAssertEqual(Avatar.initials(for: "mia.lou.x"), "ML")
        XCTAssertEqual(Avatar.initials(for: ""), "?")
    }
}
