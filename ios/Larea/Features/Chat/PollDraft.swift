import Foundation

enum PollDuration: CaseIterable, Equatable, Sendable {
    case none, hour, sixHours, day

    var minutes: Int? {
        switch self {
        case .none: return nil
        case .hour: return 60
        case .sixHours: return 360
        case .day: return 1440
        }
    }

    var label: String {
        switch self {
        case .none: return "Until closed"
        case .hour: return "1 hour"
        case .sixHours: return "6 hours"
        case .day: return "1 day"
        }
    }
}

struct PollDraft: Equatable, Sendable {
    var question = ""
    var options = ["", ""]
    var duration: PollDuration = .none
}

/// Mirrors the backend's limits so the sheet can explain problems before sending.
enum PollValidation {
    static let questionMax = 200
    static let optionMax = 60
    static let minOptions = 2
    static let maxOptions = 6

    static func cleaned(_ draft: PollDraft) -> PollDraft {
        var out = draft
        out.question = draft.question.trimmingCharacters(in: .whitespacesAndNewlines)
        out.options = draft.options.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return out
    }

    /// nil when the draft can be sent, otherwise the first problem to fix.
    static func validate(_ draft: PollDraft) -> String? {
        let clean = cleaned(draft)
        if clean.question.isEmpty { return "Ask a question." }
        if clean.question.count > questionMax { return "Keep the question under \(questionMax) characters." }
        if clean.options.count < minOptions { return "Add at least two options." }
        if clean.options.count > maxOptions { return "At most \(maxOptions) options." }
        if clean.options.contains(where: { $0.count > optionMax }) { return "Keep each option under \(optionMax) characters." }
        if Set(clean.options.map { $0.lowercased() }).count != clean.options.count { return "Options must be different from each other." }
        return nil
    }
}
