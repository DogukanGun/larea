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
}
