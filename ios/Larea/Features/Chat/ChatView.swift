import SwiftUI

struct ChatView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model: ChatViewModel?
    @State private var draft = ""
    @State private var reporting: ChatMessage?
    @State private var blocking: ChatMessage?
    @State private var scrolledId: String?
    let venueId: String
    let venueName: String
    let onLeft: () -> Void

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text(venueName).font(.lareaHeadline)
                    Text(presenceText).font(.caption).foregroundStyle(.secondary)
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                Button { Task { await model?.leave() } } label: { Label("Leave", systemImage: "chevron.left") }
                    .labelStyle(.titleAndIcon)
                    .accessibilityIdentifier("chat.leave")
            }
        }
        .onAppear {
            if model == nil { model = ChatViewModel(venueId: venueId, api: env.api, realtime: env.realtime, location: env.location, session: env.session) }
            model?.start()
        }
        .onDisappear { model?.stop() }
    }

    private var presenceText: String {
        let n = model?.presence ?? 0
        return n == 1 ? "1 person here" : "\(n) people here"
    }

    @ViewBuilder
    private func content(_ model: ChatViewModel) -> some View {
        @Bindable var model = model
        let rows = buildChatRows(messages: model.messages) + model.notices.map(ChatRow.notice) + model.pending.map(ChatRow.pending)

        ScrollView {
            LazyVStack(spacing: 4) {
                if rows.isEmpty, !model.loading {
                    ContentUnavailableView("Say hello", systemImage: "bubble.left.and.bubble.right.fill", description: Text("Nobody has said anything yet. Start the conversation."))
                        .padding(.top, 80)
                }
                ForEach(rows) { row in
                    rowView(row, model: model)
                        .id(row.id)
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
            .scrollTargetLayout()
            .padding(.horizontal, Spacing.m)
            .padding(.vertical, Spacing.s)
        }
        .scrollPosition(id: $scrolledId, anchor: .bottom)
        .defaultScrollAnchor(.bottom)
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 0) {
                if model.connection != .connected { Banner(kind: .info, text: "Reconnecting…") }
                if model.weakGps { Banner(kind: .warning, text: "Weak GPS signal. We may not be able to confirm you're still here.") }
                if model.isMuted, let until = model.mutedUntil {
                    Banner(kind: .danger, text: "You can't send messages until \(until.lareaShort).")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Composer(draft: $draft, disabled: model.isMuted) {
                let text = draft
                draft = ""
                Task { await model.send(text) }
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.35), value: rows.map(\.id))
        .onChange(of: rows.count) { _, _ in
            // Pin to the newest row only when the user is already near the bottom.
            let nearBottom = scrolledId == nil || rows.suffix(3).contains { $0.id == scrolledId }
            if nearBottom, let last = rows.last { scrolledId = last.id }
        }
        .sensoryFeedback(.success, trigger: model.sentCount)
        .sensoryFeedback(.warning, trigger: model.removedCount)
        .sheet(isPresented: Binding(get: { model.removed != nil }, set: { _ in })) {
            RemovedSheet(message: model.removed ?? "", onDone: onLeft)
                .presentationDetents([.fraction(0.42)])
                .interactiveDismissDisabled()
        }
        .alert("Something went wrong", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
        .sheet(item: $reporting) { message in
            ReportSheet { reason in
                reporting = nil
                Task { await model.report(message, reason: reason) }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .confirmationDialog(
            "Block \(blocking?.author.displayName ?? "")?",
            isPresented: Binding(get: { blocking != nil }, set: { if !$0 { blocking = nil } }),
            titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) {
                if let author = blocking?.author { Task { await model.block(author) } }
                blocking = nil
            }
            Button("Cancel", role: .cancel) { blocking = nil }
        } message: {
            Text("You won't see each other's messages. They won't be told.")
        }
        .onChange(of: model.left) { _, left in if left { onLeft() } }
    }

    @ViewBuilder
    private func rowView(_ row: ChatRow, model: ChatViewModel) -> some View {
        switch row {
        case let .separator(_, date):
            Text(Self.separatorText(date))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.vertical, Spacing.m)
                .frame(maxWidth: .infinity)
        case let .message(message, position, showHeader):
            let mine = message.author.id == model.myUserId
            MessageRow(message: message, position: position, showHeader: showHeader && !mine, mine: mine)
                .contextMenu {
                    if !mine {
                        Button("Report", systemImage: "flag") { reporting = message }
                        Button("Block \(message.author.displayName)", systemImage: "hand.raised", role: .destructive) { blocking = message }
                    }
                }
                .padding(.top, showHeader ? Spacing.s : 0)
        case let .notice(notice):
            NoticeChip(notice: notice).padding(.vertical, Spacing.xs)
        case let .pending(pending):
            Bubble(text: pending.text, mine: true, position: .single, pending: true)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }

    private static func separatorText(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return date.formatted(date: .omitted, time: .shortened) }
        return date.formatted(.dateTime.weekday(.wide).hour().minute())
    }
}

private struct MessageRow: View {
    let message: ChatMessage
    let position: GroupPosition
    let showHeader: Bool
    let mine: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: Spacing.s) {
            if mine {
                Spacer(minLength: 60)
            } else {
                if position == .single || position == .last {
                    Avatar(name: message.author.displayName, seed: message.author.id, size: 30)
                } else {
                    Color.clear.frame(width: 30, height: 30)
                }
            }
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                if showHeader {
                    Text(message.author.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Avatar.palette[Avatar.colorIndex(for: message.author.id)])
                        .padding(.leading, 6)
                }
                Bubble(text: message.text, mine: mine, position: position, pending: false)
                if position == .single || position == .last {
                    Text(Self.time(message.createdAt)).font(.caption2).foregroundStyle(.tertiary).padding(.horizontal, 6)
                }
            }
            if !mine { Spacer(minLength: 60) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(message.author.displayName): \(message.text)")
    }

    private static func time(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.larea.date(from: iso) else { return "" }
        return date.formatted(date: .omitted, time: .shortened)
    }
}

private struct Bubble: View {
    let text: String
    let mine: Bool
    let position: GroupPosition
    let pending: Bool

    private var shape: UnevenRoundedRectangle {
        let big = Radius.bubble
        let small: CGFloat = 6
        let joinedAbove = position == .middle || position == .last
        let joinedBelow = position == .first || position == .middle
        return UnevenRoundedRectangle(
            topLeadingRadius: !mine && joinedAbove ? small : big,
            bottomLeadingRadius: !mine && joinedBelow ? small : big,
            bottomTrailingRadius: mine && joinedBelow ? small : big,
            topTrailingRadius: mine && joinedAbove ? small : big,
            style: .continuous
        )
    }

    var body: some View {
        Text(text)
            .font(.body)
            .foregroundStyle(mine ? Color.white : Color.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(mine ? Color.brandPrimary : Color(.secondarySystemGroupedBackground), in: shape)
            .opacity(pending ? 0.55 : 1)
            .frame(maxWidth: 300, alignment: mine ? .trailing : .leading)
    }
}

private struct NoticeChip: View {
    let notice: SystemNotice

    private var symbol: String {
        switch notice.kind {
        case .blocked: return "hand.raised.fill"
        case .censored: return "eye.slash.fill"
        case .warned: return "exclamationmark.bubble.fill"
        case .info: return "info.circle.fill"
        }
    }

    var body: some View {
        Label(notice.text, systemImage: symbol)
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, Spacing.m)
            .padding(.vertical, 6)
            .background(Color(.tertiarySystemFill), in: Capsule())
            .frame(maxWidth: .infinity)
    }
}

private struct Composer: View {
    @Binding var draft: String
    let disabled: Bool
    let onSend: () -> Void

    private var canSend: Bool { !disabled && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(spacing: 4) {
            HStack(alignment: .bottom, spacing: Spacing.s) {
                TextField(disabled ? "You're muted for now" : "Say something…", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: Radius.bubble, style: .continuous))
                    .disabled(disabled)
                    .accessibilityIdentifier("chat.composer")
                    .onChange(of: draft) { _, value in if value.count > 500 { draft = String(value.prefix(500)) } }
                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(canSend ? Color.brandPrimary : Color(.systemGray4), in: Circle())
                }
                .disabled(!canSend)
                .accessibilityLabel("Send")
                .accessibilityIdentifier("chat.send")
            }
            if draft.count > 400 {
                Text("\(draft.count)/500")
                    .font(.caption2)
                    .foregroundStyle(draft.count >= 500 ? Color.danger : .secondary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.horizontal, Spacing.m)
        .padding(.vertical, Spacing.s)
        .background(.bar)
    }
}

private struct RemovedSheet: View {
    let message: String
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: Spacing.l) {
            HeroGlyph(symbol: "figure.walk.departure").padding(.top, Spacing.xl)
            Text("You've left the area").font(.lareaTitle2)
            Text(message).font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Spacer()
            PrimaryButton(title: "Back to nearby chats", action: onDone)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, Spacing.xl)
    }
}

struct ReportSheet: View {
    let onReport: (String) -> Void
    private let reasons: [(code: String, title: String, detail: String, symbol: String)] = [
        ("HARASSMENT", "Harassment", "Targeting or bullying someone", "person.crop.circle.badge.exclamationmark"),
        ("THREAT", "Threat", "Threatening or intimidating", "exclamationmark.shield"),
        ("HATE", "Hate", "Attacks on a group of people", "hand.thumbsdown"),
        ("SEXUAL", "Sexual content", "Explicit or unwanted advances", "eye.slash"),
        ("SPAM", "Spam", "Repeated or off-topic posts", "arrow.2.squarepath"),
        ("SCAM", "Scam", "Fraud or suspicious offers", "creditcard.trianglebadge.exclamationmark"),
        ("PERSONAL_INFO", "Personal information", "Sharing someone's private details", "lock.open"),
        ("OTHER", "Something else", "Anything else that feels wrong", "ellipsis.circle"),
    ]

    var body: some View {
        NavigationStack {
            List(reasons, id: \.code) { reason in
                Button { onReport(reason.code) } label: {
                    HStack(spacing: Spacing.m) {
                        Image(systemName: reason.symbol)
                            .font(.headline)
                            .foregroundStyle(Color.brandPrimary)
                            .frame(width: 36, height: 36)
                            .background(Color.brandTint, in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(reason.title).font(.lareaHeadline).foregroundStyle(.primary)
                            Text(reason.detail).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Report message")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
