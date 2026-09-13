import XCTest
@testable import Larea

final class MarketModelsTests: XCTestCase {
    private let listingJSON = """
    {"id":"l1","kind":"OFFER","category":"FURNITURE","title":"Desk","description":"White","priceCents":2500,"currency":"eur","status":"ACTIVE","owner":{"id":"u1","displayName":"anna"},"mine":false,"images":[{"url":"/media/a.jpg","thumbUrl":"/media/a_thumb.jpg","width":1600,"height":1200}],"location":{"lat":48.14,"lng":11.57,"approximate":true},"distanceM":450,"createdAt":"2026-09-13T10:00:00.000Z","expiresAt":"2026-10-13T10:00:00.000Z","myOffer":null}
    """

    func testListingDecodesWithDefaultsAndUnknownEnums() throws {
        let listing = try JSONDecoder().decode(Listing.self, from: Data(listingJSON.utf8))
        XCTAssertEqual(listing.kind, .offer)
        XCTAssertEqual(listing.category, .furniture)
        XCTAssertEqual(listing.distanceText, "450 m")
        XCTAssertNil(listing.myOffer)
        XCTAssertNil(listing.offers)
        XCTAssertEqual(listing.images.first?.thumbUrl, "/media/a_thumb.jpg")

        let weird = listingJSON.replacingOccurrences(of: "\"FURNITURE\"", with: "\"SPACESHIPS\"").replacingOccurrences(of: "\"ACTIVE\"", with: "\"FROZEN\"")
        let decoded = try JSONDecoder().decode(Listing.self, from: Data(weird.utf8))
        XCTAssertEqual(decoded.category, .unknown)
        XCTAssertEqual(decoded.status, .unknown)
    }

    func testOfferAndMeDecode() throws {
        let json = """
        {"payoutsEnabled":false,"listings":[],"offersMade":[{"id":"o1","listingId":"l1","listing":{"id":"l1","title":"Desk","kind":"OFFER","priceCents":2500,"thumbUrl":null,"status":"ACTIVE"},"offerer":{"id":"u2","displayName":"ben"},"amountCents":2000,"note":null,"status":"PENDING","expiresAt":"2026-09-16T10:00:00.000Z","respondedAt":null,"orderId":null,"createdAt":"2026-09-13T10:00:00.000Z"}],"offersReceived":[]}
        """
        let me = try JSONDecoder().decode(MarketMeResponse.self, from: Data(json.utf8))
        XCTAssertEqual(me.offersMade.first?.status, .pending)
        XCTAssertEqual(me.offersMade.first?.listing.title, "Desk")
        XCTAssertNil(me.offersMade.first?.listing.thumbURL)
        XCTAssertEqual(try JSONDecoder().decode(MarketMeResponse.self, from: Data("{}".utf8)).listings, [])
    }

    func testMarketConfigDefaults() throws {
        let config = try JSONDecoder().decode(MarketConfig.self, from: Data(#"{"payments":true,"maxPriceCents":20000}"#.utf8))
        XCTAssertTrue(config.payments)
        XCTAssertEqual(config.maxPriceCents, 20000)
        XCTAssertEqual(config.radiusM, 2000)
    }
}
