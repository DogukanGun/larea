import XCTest
@testable import Larea

final class MessageGroupingTests: XCTestCase {
    private func message(_ id: String, author: String, at seconds: TimeInterval) -> ChatMessage {
        let date = Date(timeIntervalSince1970: 1_800_000_000 + seconds)
        return ChatMessage(id: id, venueId: "v", author: Author(id: author, displayName: author), text: id, status: "APPROVED", createdAt: ISO8601DateFormatter.larea.string(from: date))
    }

    func testGroupsConsecutiveMessagesBySameAuthorWithinWindow() {
        let rows = buildChatRows(messages: [
            message("a1", author: "anna", at: 0),
            message("a2", author: "anna", at: 60),
            message("a3", author: "anna", at: 120),
            message("b1", author: "ben", at: 130),
            message("a4", author: "anna", at: 140),
        ])
        let positions = rows.compactMap { row -> (String, GroupPosition, Bool)? in
            if case let .message(m, position, header) = row { return (m.id, position, header) }
            return nil
        }
        XCTAssertEqual(positions.map(\.0), ["a1", "a2", "a3", "b1", "a4"])
        XCTAssertEqual(positions.map(\.1), [.first, .middle, .last, .single, .single])
        XCTAssertEqual(positions.map(\.2), [true, false, false, true, true])
    }

    func testSplitsGroupAfterFiveMinutes() {
        let rows = buildChatRows(messages: [message("a1", author: "anna", at: 0), message("a2", author: "anna", at: 6 * 60)])
        let positions = rows.compactMap { row -> GroupPosition? in
            if case let .message(_, position, _) = row { return position }
            return nil
        }
        XCTAssertEqual(positions, [.single, .single])
    }

    func testInsertsSeparatorAtStartAndAfterAnHourGap() {
        let rows = buildChatRows(messages: [message("a1", author: "anna", at: 0), message("a2", author: "anna", at: 30), message("a3", author: "anna", at: 2 * 3600)])
        let separators = rows.filter { if case .separator = $0 { return true }; return false }
        XCTAssertEqual(separators.count, 2)
        XCTAssertEqual(rows.first?.id, "sep-a1")
    }

    func testPollsStandAloneAndSplitNeighbours() {
        var poll = message("p1", author: "anna", at: 30)
        poll.kind = .poll
        poll.poll = PollView(id: "poll", question: "Pizza?", options: [PollOptionView(id: "o1", text: "Yes")])
        let rows = buildChatRows(messages: [message("a1", author: "anna", at: 0), poll, message("a2", author: "anna", at: 60)])
        let ids = rows.map(\.id)
        XCTAssertEqual(ids, ["sep-a1", "a1", "p1", "a2"])
        guard case let .message(_, first, _) = rows[1], case .poll = rows[2], case let .message(_, last, _) = rows[3] else { return XCTFail("row kinds") }
        XCTAssertEqual(first, .single)
        XCTAssertEqual(last, .single)
    }
}
