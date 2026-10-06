import XCTest
@testable import Larea

final class PinModelsTests: XCTestCase {
    private func decode(_ json: String) throws -> ServerEvent {
        try JSONDecoder().decode(ServerEvent.self, from: Data(json.utf8))
    }

    func testDecodesPinEvents() throws {
        guard case let .pinMessage(message) = try decode(#"{"type":"pin_message","message":{"id":"m1","pinId":"p1","author":{"id":"u1","displayName":"anna_k"},"text":"I saw the cat","status":"APPROVED","createdAt":"2026-10-05T12:00:00.000Z"}}"#) else { return XCTFail("pin_message") }
        XCTAssertEqual(message.pinId, "p1")
        XCTAssertEqual(message.text, "I saw the cat")

        guard case let .pinMessageHidden(pinId, messageId) = try decode(#"{"type":"pin_message_hidden","pinId":"p1","messageId":"m1"}"#) else { return XCTFail("hidden") }
        XCTAssertEqual(pinId, "p1"); XCTAssertEqual(messageId, "m1")

        guard case let .pinUpdated(_, text, _) = try decode(#"{"type":"pin_updated","pinId":"p1","text":"Moved to 8pm","editedAt":"2026-10-05T12:00:00.000Z"}"#) else { return XCTFail("updated") }
        XCTAssertEqual(text, "Moved to 8pm")

        guard case let .pinClosed(_, reason, _) = try decode(#"{"type":"pin_closed","pinId":"p1","reason":"banned","message":"The owner of this pin removed you from its chat."}"#) else { return XCTFail("closed") }
        XCTAssertEqual(reason, "banned")
    }

    func testDecodesQuoteAndPin() throws {
        let json = #"{"pin":{"id":"5b0c1f4e-8a7d-4a5e-9c1e-2f3a4b5c6d7e","text":"Concert tonight","tier":"CITY","status":"PENDING_PAYMENT","lat":48.1,"lng":11.5,"owner":{"id":"u1","displayName":"anna_k"},"mine":true,"createdAt":"2026-10-05T12:00:00.000Z","expiresAt":null,"editedAt":null,"messageCount":0},"tier":"CITY","productId":"com.dogukangundogan.larea.pin.city","priceUsd":"10.99","durationHours":72,"buyerCity":"Munich","targetCity":"Munich"}"#
        let quote = try JSONDecoder().decode(PinQuote.self, from: Data(json.utf8))
        XCTAssertEqual(quote.tier, .city)
        XCTAssertEqual(quote.productId, PinTier.city.productId)
        XCTAssertEqual(quote.durationText, "3 days")
        XCTAssertFalse(quote.pin.isLive)
        XCTAssertTrue(quote.pin.canChat) // the owner always can
        XCTAssertNotNil(UUID(uuidString: quote.pin.id))
    }

    func testOnlyNearbyPeopleCanChat() throws {
        let future = ISO8601DateFormatter.larea.string(from: Date().addingTimeInterval(3600))
        let json = #"{"id":"p1","text":"hi","tier":"NEARBY","status":"ACTIVE","lat":1,"lng":2,"owner":{"id":"u1","displayName":"a"},"mine":false,"createdAt":"2026-10-05T12:00:00.000Z","expiresAt":"\#(future)","editedAt":null,"messageCount":3,"distanceM":1260,"eligible":false}"#
        let pin = try JSONDecoder().decode(MessagePin.self, from: Data(json.utf8))
        XCTAssertTrue(pin.isLive)
        XCTAssertFalse(pin.canChat)
        XCTAssertEqual(pin.distanceText, "1.3 km")
    }

    func testFeaturesReadPinsFlag() throws {
        let features = try JSONDecoder().decode(Features.self, from: Data(#"{"images":true,"pins":true}"#.utf8))
        XCTAssertTrue(features.pins)
        XCTAssertFalse(try JSONDecoder().decode(Features.self, from: Data("{}".utf8)).pins)
    }

    @MainActor
    func testOpeningAPinShowsItOnTheNearbyTab() {
        let router = AppRouter()
        router.tab = .market
        router.openPin("p1")
        XCTAssertEqual(router.tab, .nearby)
        XCTAssertEqual(router.nearbyPath, [.pin("p1")])
    }
}
