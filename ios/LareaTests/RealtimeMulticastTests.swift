import XCTest
@testable import Larea

private struct StubTokens: TokenProviding {
    func accessToken() async -> String? { nil }
    func refresh(stale: String?) async -> String? { nil }
}

@MainActor
final class RealtimeMulticastTests: XCTestCase {
    func testEveryObserverReceivesEachFrame() {
        let client = RealtimeClient(url: URL(string: "ws://localhost:1/ws")!, tokens: StubTokens())
        var first: [ServerEvent] = []
        var second: [ServerEvent] = []
        let a = client.addObserver { first.append($0) }
        client.addObserver { second.append($0) }

        client.ingest(#"{"type":"presence","venueId":"v1","count":3}"#)
        XCTAssertEqual(first, [.presence(venueId: "v1", count: 3)])
        XCTAssertEqual(second, first)

        client.removeObserver(a)
        client.ingest(#"{"type":"pong"}"#)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(second.count, 2)
    }

    func testGarbageFramesAreDropped() {
        let client = RealtimeClient(url: URL(string: "ws://localhost:1/ws")!, tokens: StubTokens())
        var seen = 0
        client.addObserver { _ in seen += 1 }
        client.ingest("not json")
        client.ingest(#"{"type":"hologram"}"#)
        XCTAssertEqual(seen, 0)
    }
}
