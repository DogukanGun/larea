import XCTest
@testable import Larea

final class ServerEventDecodingTests: XCTestCase {
    private func decode(_ json: String) throws -> ServerEvent {
        try JSONDecoder().decode(ServerEvent.self, from: Data(json.utf8))
    }

    func testDecodesEveryEventType() throws {
        guard case let .ack(ack) = try decode(#"{"type":"ack","reqId":"r1","ok":true,"data":{"state":"eligible","removed":false,"timing":{"heartbeatIntervalSec":25}}}"#) else { return XCTFail("ack") }
        XCTAssertEqual(ack.reqId, "r1")
        XCTAssertTrue(ack.ok)
        XCTAssertEqual(ack.data?["state"]?.stringValue, "eligible")
        XCTAssertEqual(ack.data?["removed"]?.boolValue, false)
        XCTAssertEqual(ack.data?["timing"]?.objectValue?["heartbeatIntervalSec"]?.intValue, 25)

        guard case let .message(message) = try decode(#"{"type":"message","message":{"id":"m1","venueId":"v1","author":{"id":"u1","displayName":"anna_k"},"text":"hi","status":"APPROVED","createdAt":"2026-09-06T21:00:00.000Z"}}"#) else { return XCTFail("message") }
        XCTAssertEqual(message.author.displayName, "anna_k")

        guard case let .pollUpdate(pollVenue, pollMessage, poll) = try decode(#"{"type":"poll_update","venueId":"v1","messageId":"m9","poll":{"id":"p1","question":"Pizza?","options":[{"id":"o1","text":"Yes","votes":2},{"id":"o2","text":"No","votes":1}],"totalVotes":3,"closed":false,"closesAt":null}}"#) else { return XCTFail("poll_update") }
        XCTAssertEqual(pollVenue, "v1"); XCTAssertEqual(pollMessage, "m9")
        XCTAssertEqual(poll.options.map(\.votes), [2, 1]); XCTAssertNil(poll.myOptionId); XCTAssertFalse(poll.isClosed)

        guard case let .marketUpdate(kind, listingId, offerId, orderId) = try decode(#"{"type":"market_update","kind":"offer_received","listingId":"l1","offerId":"o1"}"#) else { return XCTFail("market_update") }
        XCTAssertEqual(kind, "offer_received"); XCTAssertEqual(listingId, "l1"); XCTAssertEqual(offerId, "o1"); XCTAssertNil(orderId)

        guard case let .messageHidden(venueId, messageId) = try decode(#"{"type":"message_hidden","venueId":"v1","messageId":"m1"}"#) else { return XCTFail("hidden") }
        XCTAssertEqual(venueId, "v1"); XCTAssertEqual(messageId, "m1")

        guard case let .removed(_, reason, text) = try decode(#"{"type":"removed","venueId":"v1","reason":"out_of_range","message":"You're no longer near this location. You've been removed from the chat."}"#) else { return XCTFail("removed") }
        XCTAssertEqual(reason, "out_of_range")
        XCTAssertTrue(text.contains("removed"))

        guard case let .enforcement(kind, until, _) = try decode(#"{"type":"enforcement","kind":"mute","until":"2026-09-07T00:00:00.000Z","message":"muted"}"#) else { return XCTFail("enforcement") }
        XCTAssertEqual(kind, "mute"); XCTAssertNotNil(until)

        guard case let .presence(_, count) = try decode(#"{"type":"presence","venueId":"v1","count":7}"#) else { return XCTFail("presence") }
        XCTAssertEqual(count, 7)

        guard case .pong = try decode(#"{"type":"pong","reqId":"r2"}"#) else { return XCTFail("pong") }
        guard case let .error(_, code, _) = try decode(#"{"type":"error","reqId":"r3","code":"BAD_MESSAGE","message":"x"}"#) else { return XCTFail("error") }
        XCTAssertEqual(code, "BAD_MESSAGE")
    }

    func testIgnoresUnknownFields() throws {
        guard case let .presence(_, count) = try decode(#"{"type":"presence","venueId":"v1","count":1,"extra":{"nested":true}}"#) else { return XCTFail() }
        XCTAssertEqual(count, 1)
    }

    func testRejectsUnknownEventType() {
        XCTAssertThrowsError(try decode(#"{"type":"something_else"}"#))
    }
}
