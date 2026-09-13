import XCTest
@testable import Larea

final class PriceFormattingTests: XCTestCase {
    private func plain(_ text: String) -> String {
        text.replacingOccurrences(of: "\u{00A0}", with: " ").replacingOccurrences(of: "\u{202F}", with: " ")
    }

    func testFormatsInTheGivenLocale() {
        XCTAssertEqual(plain(Money.format(cents: 1250, locale: Locale(identifier: "de_DE"))), "12,50 €")
        XCTAssertEqual(plain(Money.format(cents: 5000, locale: Locale(identifier: "de_DE"))), "50 €")
        XCTAssertEqual(plain(Money.format(cents: 1250, locale: Locale(identifier: "en_US"))), "€12.50")
    }

    func testParsesWhatPeopleType() {
        XCTAssertEqual(Money.parse("12"), 1200)
        XCTAssertEqual(Money.parse("12,50"), 1250)
        XCTAssertEqual(Money.parse("12.50"), 1250)
        XCTAssertEqual(Money.parse("€ 7"), 700)
        XCTAssertEqual(Money.parse("1.234,56"), 123_456)
        XCTAssertNil(Money.parse("abc"))
        XCTAssertNil(Money.parse("0"))
        XCTAssertNil(Money.parse(""))
        XCTAssertNil(Money.parse("1,234"))
    }
}
