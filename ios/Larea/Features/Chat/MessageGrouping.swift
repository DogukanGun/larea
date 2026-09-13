import Foundation

enum GroupPosition: Equatable {
    case single, first, middle, last
}

struct SystemNotice: Identifiable, Equatable, Sendable {
    enum Kind: Sendable { case blocked, censored, warned, info }
    let id: String
    let kind: Kind
    let text: String
}

enum ChatRow: Identifiable, Equatable {
    case separator(id: String, date: Date)
    case message(ChatMessage, position: GroupPosition, showHeader: Bool)
    /// A poll stands on its own: it never groups with the bubbles around it.
    case poll(ChatMessage)
    case notice(SystemNotice)
    case pending(PendingMessage)

    var id: String {
        switch self {
        case let .separator(id, _): return "sep-\(id)"
        case let .message(message, _, _): return message.id
        case let .poll(message): return message.id
        case let .notice(notice): return "notice-\(notice.id)"
        case let .pending(pending): return "pending-\(pending.id)"
        }
    }
}

/// Groups consecutive messages by the same author within `groupWindow` and inserts a
/// time separator wherever the gap between messages is at least `separatorGap`.
func buildChatRows(
    messages: [ChatMessage],
    groupWindow: TimeInterval = 5 * 60,
    separatorGap: TimeInterval = 60 * 60
) -> [ChatRow] {
    var rows: [ChatRow] = []
    let dated = messages.map { ($0, ISO8601DateFormatter.larea.date(from: $0.createdAt) ?? .distantPast) }

    for (index, (message, date)) in dated.enumerated() {
        let previous = index > 0 ? dated[index - 1] : nil
        let next = index + 1 < dated.count ? dated[index + 1] : nil

        let gapBefore = previous.map { date.timeIntervalSince($0.1) }
        if index == 0 || (gapBefore ?? 0) >= separatorGap {
            rows.append(.separator(id: message.id, date: date))
        }

        if message.kind == .poll {
            rows.append(.poll(message))
            continue
        }
        let groupedWithPrevious = previous.map { $0.0.kind != .poll && $0.0.author.id == message.author.id && (gapBefore ?? .infinity) < groupWindow && (gapBefore ?? 0) < separatorGap } ?? false
        let groupedWithNext = next.map { $0.0.kind != .poll && $0.0.author.id == message.author.id && $0.1.timeIntervalSince(date) < groupWindow && $0.1.timeIntervalSince(date) < separatorGap } ?? false

        let position: GroupPosition
        switch (groupedWithPrevious, groupedWithNext) {
        case (false, false): position = .single
        case (false, true): position = .first
        case (true, true): position = .middle
        case (true, false): position = .last
        }
        rows.append(.message(message, position: position, showHeader: !groupedWithPrevious))
    }
    return rows
}
