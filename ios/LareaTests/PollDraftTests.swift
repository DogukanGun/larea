import XCTest
@testable import Larea

final class PollDraftTests: XCTestCase {
    func testValidDraftPasses() {
        let draft = PollDraft(question: " Pizza or ramen? ", options: ["Pizza ", "", "Ramen"], duration: .hour)
        XCTAssertNil(PollValidation.validate(draft))
        let clean = PollValidation.cleaned(draft)
        XCTAssertEqual(clean.question, "Pizza or ramen?")
        XCTAssertEqual(clean.options, ["Pizza", "Ramen"])
        XCTAssertEqual(clean.duration.minutes, 60)
    }

    func testProblemsAreReportedInOrder() {
        XCTAssertEqual(PollValidation.validate(PollDraft(question: "", options: ["a", "b"])), "Ask a question.")
        XCTAssertEqual(PollValidation.validate(PollDraft(question: String(repeating: "q", count: 201), options: ["a", "b"])), "Keep the question under 200 characters.")
        XCTAssertEqual(PollValidation.validate(PollDraft(question: "Q?", options: ["only"])), "Add at least two options.")
        XCTAssertEqual(PollValidation.validate(PollDraft(question: "Q?", options: ["a", "b", "c", "d", "e", "f", "g"])), "At most 6 options.")
        XCTAssertEqual(PollValidation.validate(PollDraft(question: "Q?", options: ["a", String(repeating: "b", count: 61)])), "Keep each option under 60 characters.")
        XCTAssertEqual(PollValidation.validate(PollDraft(question: "Q?", options: ["Same", "same"])), "Options must be different from each other.")
    }

    func testMergingKeepsOwnVoteWhenUpdateLacksIt() {
        let mine = PollView(id: "p", question: "Q?", options: [PollOptionView(id: "a", text: "A", votes: 1)], totalVotes: 1, myOptionId: "a")
        let update = PollView(id: "p", question: "Q?", options: [PollOptionView(id: "a", text: "A", votes: 3)], totalVotes: 3)
        let merged = mine.merging(update: update)
        XCTAssertEqual(merged.options.first?.votes, 3)
        XCTAssertEqual(merged.myOptionId, "a")
        XCTAssertEqual(merged.percent(of: merged.options[0]), 100)
        XCTAssertTrue(PollView(id: "p", question: "Q?", options: [], closesAt: "2020-01-01T00:00:00.000Z").isClosed)
    }
}
