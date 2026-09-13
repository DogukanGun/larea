import XCTest
@testable import Larea

final class ListingValidationTests: XCTestCase {
    private let config = MarketConfig()

    func testValidListingPasses() {
        XCTAssertNil(ListingValidation.validate(title: "IKEA desk", description: "White", priceCents: 2500, config: config))
    }

    func testProblemsInOrder() {
        XCTAssertEqual(ListingValidation.validate(title: "ab", description: "", priceCents: 2500, config: config), "Give it a title of at least 3 characters.")
        XCTAssertEqual(ListingValidation.validate(title: String(repeating: "t", count: 81), description: "", priceCents: 2500, config: config), "Keep the title under 80 characters.")
        XCTAssertEqual(ListingValidation.validate(title: "Desk", description: String(repeating: "d", count: 1001), priceCents: 2500, config: config), "Keep the description under 1000 characters.")
        XCTAssertEqual(ListingValidation.validate(title: "Desk", description: "", priceCents: nil, config: config), "Enter a price.")
        XCTAssertTrue(ListingValidation.validate(title: "Desk", description: "", priceCents: 50, config: config)?.hasPrefix("Prices must be between") == true)
        XCTAssertTrue(ListingValidation.validate(title: "Desk", description: "", priceCents: 60_000, config: config)?.hasPrefix("Prices must be between") == true)
    }

    func testFilterQueryItems() {
        var filters = MarketFilters()
        XCTAssertTrue(filters.queryItems.isEmpty)
        XCTAssertFalse(filters.isActive)
        filters.kind = .request
        filters.category = .help
        filters.minCents = 500
        filters.sort = .price
        filters.query = "  sofa  "
        let items = Dictionary(uniqueKeysWithValues: filters.queryItems.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(items, ["kind": "REQUEST", "category": "HELP", "minPriceCents": "500", "sort": "price", "q": "sofa"])
        XCTAssertTrue(filters.isActive)
    }
}
