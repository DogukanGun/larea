import XCTest
@testable import Larea

final class APIModelsTests: XCTestCase {
    func testDecodesStructuredError() throws {
        let body = try JSONDecoder().decode(APIErrorBody.self, from: Data(#"{"code":"MUTED","message":"You can't send messages right now.","mutedUntil":"2026-09-07T00:00:00.000Z"}"#.utf8))
        XCTAssertEqual(body.code, "MUTED")
        XCTAssertEqual(body.mutedUntil, "2026-09-07T00:00:00.000Z")
        let error = APIError.api(code: body.code, message: body.message, status: 403, mutedUntil: body.mutedUntil, retryAfterSec: nil)
        XCTAssertEqual(error.userMessage, "You can't send messages right now.")
        XCTAssertEqual(error.code, "MUTED")
    }

    func testDecodesMeAndJoinResult() throws {
        let me = try JSONDecoder().decode(MeView.self, from: Data(#"{"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"ageVerifiedAt":null,"mutedUntil":null,"suspendedAt":null,"createdAt":"2026-09-06T21:00:00.000Z","activeMembership":{"venueId":"v1","venueName":"Main Square","joinedAt":"2026-09-06T21:00:00.000Z"}}"#.utf8))
        XCTAssertTrue(me.ageVerified)
        XCTAssertEqual(me.activeMembership?.venueName, "Main Square")

        let join = try JSONDecoder().decode(JoinResult.self, from: Data(#"{"membership":{"id":"m","venueId":"v1","joinedAt":"x"},"venue":{"id":"v1","slug":"main-square","name":"Main Square","label":"General Chat"},"timing":{"heartbeatIntervalSec":25,"staleAfterSec":120,"weakGpsGraceSec":300},"memberCount":3}"#.utf8))
        XCTAssertEqual(join.timing.heartbeatIntervalSec, 25)
        XCTAssertEqual(join.memberCount, 3)
    }

    func testTimestampParsing() {
        let date = ISO8601DateFormatter.larea.date(from: "2026-09-06T21:00:00.000Z")
        XCTAssertNotNil(date)
    }

    func testReconnectDelayGrowsAndCaps() {
        XCTAssertEqual(reconnectDelay(attempt: 1), 1)
        XCTAssertEqual(reconnectDelay(attempt: 2), 2)
        XCTAssertEqual(reconnectDelay(attempt: 3), 4)
        XCTAssertEqual(reconnectDelay(attempt: 10), 30)
    }
}

final class NearbyModelsTests: XCTestCase {
    func testDecodesNearbyResponseWithPlaces() throws {
        let json = #"{"venues":[{"id":"v1","slug":"osm-node-1","name":"Bezirkszentralbibliothek","label":"General Chat","category":"library","address":"Brunnenstraße 181","lat":52.5316,"lng":13.3987,"distanceM":80,"eligible":true,"memberCount":2},{"id":"v2","slug":"x","name":"Odd place","label":"General Chat","category":"spaceport","lat":1,"lng":2,"eligible":false,"memberCount":0}],"degraded":false,"attribution":"Place data © OpenStreetMap contributors"}"#
        let response = try JSONDecoder().decode(NearbyResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.venues.count, 2)
        XCTAssertEqual(response.venues[0].category, .library)
        XCTAssertEqual(response.venues[0].distanceText, "80 m")
        XCTAssertEqual(response.venues[1].category, .unknown) // unknown categories degrade gracefully
        XCTAssertEqual(response.venues[1].distanceM, 0)
        XCTAssertEqual(response.attribution, "Place data © OpenStreetMap contributors")
        XCTAssertFalse(response.degraded)
    }

    func testDistanceTextSwitchesToKilometres() {
        let venue = NearbyVenue(id: "v", slug: "s", name: "n", label: "l", category: .park, address: nil, lat: 0, lng: 0, distanceM: 1260, eligible: false, memberCount: 0)
        XCTAssertEqual(venue.distanceText, "1.3 km")
    }

    func testFeaturesDefaultToOffWhenAbsent() throws {
        let legacy = """
        {"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"ageVerifiedAt":null,"mutedUntil":null,"suspendedAt":null,"createdAt":"2026-09-13T10:00:00.000Z","activeMembership":null}
        """
        let me = try JSONDecoder().decode(MeView.self, from: Data(legacy.utf8))
        XCTAssertNil(me.features)
        XCTAssertEqual(me.capabilities, .none)

        let current = """
        {"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"ageVerifiedAt":null,"mutedUntil":null,"suspendedAt":null,"createdAt":"2026-09-13T10:00:00.000Z","activeMembership":null,"features":{"market":true,"payments":false}}
        """
        let now = try JSONDecoder().decode(MeView.self, from: Data(current.utf8))
        XCTAssertEqual(now.capabilities, Features(images: false, polls: false, market: true, payments: false))
    }

    func testMembersResponseDecodes() throws {
        let json = #"{"members":[{"id":"u1","displayName":"anna"},{"id":"u2","displayName":"ben"}],"count":3}"#
        let response = try JSONDecoder().decode(MembersResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.members.map(\.displayName), ["anna", "ben"])
        XCTAssertEqual(response.count, 3)
    }

    func testImageMessagesDecodeAndLegacyMessagesDefaultToText() throws {
        let image = """
        {"id":"m1","venueId":"v1","author":{"id":"u1","displayName":"anna"},"kind":"IMAGE","text":"lunch","caption":"lunch","image":{"url":"https://x/media/a.jpg","thumbUrl":"https://x/media/a_thumb.jpg","width":1600,"height":1200},"status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}
        """
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(image.utf8))
        XCTAssertEqual(message.kind, .image)
        XCTAssertEqual(message.caption, "lunch")
        XCTAssertEqual(message.image?.width, 1600)
        XCTAssertEqual(Double(message.image?.aspectRatio ?? 0), 4.0 / 3.0, accuracy: 0.001)
        XCTAssertEqual(message.image?.id, "https://x/media/a.jpg")

        let legacy = """
        {"id":"m2","venueId":"v1","author":{"id":"u1","displayName":"anna"},"text":"hi","status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}
        """
        let old = try JSONDecoder().decode(ChatMessage.self, from: Data(legacy.utf8))
        XCTAssertEqual(old.kind, .text)
        XCTAssertNil(old.image)

        let future = """
        {"id":"m3","venueId":"v1","author":{"id":"u1","displayName":"anna"},"kind":"HOLOGRAM","text":"[Hologram]","status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}
        """
        XCTAssertEqual(try JSONDecoder().decode(ChatMessage.self, from: Data(future.utf8)).kind, .unknown)
    }

    func testSendRequestsOmitAbsentFields() throws {
        let text = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SendMessageRequest.text("hi", clientKey: "k1"))) as! [String: Any]
        XCTAssertEqual(text as NSDictionary, ["text": "hi", "clientKey": "k1"] as NSDictionary)
        let image = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SendMessageRequest.image(mediaId: "abc", caption: "", clientKey: "k2"))) as! [String: Any]
        XCTAssertEqual(image as NSDictionary, ["kind": "IMAGE", "mediaId": "abc", "clientKey": "k2"] as NSDictionary)
    }

    func testRepliesDecodeTheirQuoteOrAnUnavailableOne() throws {
        let reply = """
        {"id":"m2","venueId":"v1","author":{"id":"u2","displayName":"ben"},"text":"which side?","replyTo":{"id":"m1","author":{"id":"u1","displayName":"anna"},"kind":"TEXT","text":"found a quiet corner"},"status":"APPROVED","createdAt":"2026-10-06T10:00:00.000Z"}
        """
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(reply.utf8))
        XCTAssertEqual(message.replyTo, ReplyPreview(id: "m1", author: Author(id: "u1", displayName: "anna"), kind: .text, text: "found a quiet corner"))

        let gone = """
        {"id":"m3","venueId":"v1","author":{"id":"u2","displayName":"ben"},"text":"what?","replyTo":{"id":"m1","unavailable":true},"status":"APPROVED","createdAt":"2026-10-06T10:00:00.000Z"}
        """
        XCTAssertEqual(try JSONDecoder().decode(ChatMessage.self, from: Data(gone.utf8)).replyTo, .gone("m1"))
    }

    func testReplyRequestsCarryTheAnsweredMessage() throws {
        let text = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SendMessageRequest.text("yes", replyToId: "m1", clientKey: "k1"))) as! [String: Any]
        XCTAssertEqual(text as NSDictionary, ["text": "yes", "replyToId": "m1", "clientKey": "k1"] as NSDictionary)
        let image = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SendMessageRequest.image(mediaId: "abc", caption: nil, replyToId: "m1", clientKey: "k2"))) as! [String: Any]
        XCTAssertEqual(image as NSDictionary, ["kind": "IMAGE", "mediaId": "abc", "replyToId": "m1", "clientKey": "k2"] as NSDictionary)
    }

    func testLocalQuotesFollowTheServerRules() {
        let anna = Author(id: "u1", displayName: "anna")
        let photo = ChatMessage(id: "p", venueId: "v", author: anna, text: "[Photo]", status: "APPROVED", createdAt: "", kind: .image, caption: "")
        XCTAssertEqual(ReplyPreview.of(photo).text, "[Photo]")
        let poll = ChatMessage(id: "q", venueId: "v", author: anna, text: "Poll: Coffee?", status: "APPROVED", createdAt: "", kind: .poll, poll: PollView(id: "pl", question: "Coffee at 4?", options: []))
        XCTAssertEqual(ReplyPreview.of(poll).text, "Poll: Coffee at 4?")
        let long = ChatMessage(id: "l", venueId: "v", author: anna, text: String(repeating: "a", count: 300), status: "APPROVED", createdAt: "")
        XCTAssertEqual(ReplyPreview.of(long).text?.count, 140)
        XCTAssertEqual(ReplyPreview.of(long).text?.last, "…")
    }
}
