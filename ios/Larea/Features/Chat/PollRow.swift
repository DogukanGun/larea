import SwiftUI

/// A poll in the timeline: question, one bar per option, live counts.
struct PollRow: View {
    let message: ChatMessage
    let poll: PollView
    let mine: Bool
    let onVote: (String) -> Void
    let onClose: () -> Void

    private var showResults: Bool { poll.myOptionId != nil || poll.isClosed }

    var body: some View {
        HStack(alignment: .bottom, spacing: Spacing.s) {
            if mine {
                Spacer(minLength: 40)
            } else {
                Avatar(name: message.author.displayName, seed: message.author.id, size: 30)
            }
            VStack(alignment: .leading, spacing: Spacing.s) {
                HStack(spacing: Spacing.s) {
                    Image(systemName: "chart.bar.fill").foregroundStyle(Color.brandPrimary)
                    Text(mine ? "Your poll" : message.author.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(mine ? Color.brandPrimary : Avatar.palette[Avatar.colorIndex(for: message.author.id)])
                    Spacer()
                    if poll.isClosed { Pill(text: "Closed", style: .neutral) }
                }
                Text(poll.question).font(.lareaHeadline).fixedSize(horizontal: false, vertical: true)
                ForEach(poll.options) { option in
                    PollBar(
                        text: option.text,
                        fraction: poll.totalVotes > 0 ? Double(option.votes) / Double(poll.totalVotes) : 0,
                        percent: poll.percent(of: option),
                        selected: option.id == poll.myOptionId,
                        showResults: showResults,
                        enabled: !poll.isClosed,
                        action: { onVote(option.id) }
                    )
                    .accessibilityIdentifier("poll.\(message.id).option.\(option.id)")
                }
                Text(footer).font(.caption).foregroundStyle(.secondary)
            }
            .padding(Spacing.m)
            .frame(maxWidth: 320, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.brandTint, lineWidth: mine ? 2 : 0))
            if !mine { Spacer(minLength: 40) }
        }
        .contextMenu {
            if mine, !poll.isClosed {
                Button("Close poll", systemImage: "stop.circle") { onClose() }
            }
        }
    }

    private var footer: String {
        let votes = poll.totalVotes == 1 ? "1 vote" : "\(poll.totalVotes) votes"
        if poll.isClosed { return "Final results · \(votes)" }
        if let closesAt = poll.closesAt, let date = ISO8601DateFormatter.larea.date(from: closesAt) {
            return "\(votes) · closes \(date.formatted(.relative(presentation: .numeric)))"
        }
        return showResults ? votes : "\(votes) · tap to vote"
    }
}
