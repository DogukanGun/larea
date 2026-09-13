import PhotosUI
import SwiftUI

/// A photo picked for the next message, kept until it is sent or removed.
struct ComposerAttachment: Equatable {
    let data: Data
    let preview: UIImage
}

/// The chat screen. The view model is owned by `AppRouter` so the session (heartbeat, socket
/// subscription) survives tab switches; the tab bar is hidden while the chat is on screen.
struct ChatView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let model: ChatViewModel
    let venueName: String
    let onLeft: () -> Void
    @State private var draft = ""
    @State private var reporting: ChatMessage?
    @State private var blocking: ChatMessage?
    @State private var scrolledId: String?
    @State private var showMembers = false
    @State private var attachment: ComposerAttachment?
    @State private var viewing: ImageAttachment?
    @State private var showCreatePoll = false

    var body: some View {
        content(model)
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbarVisibility(.hidden, for: .tabBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(venueName).font(.lareaHeadline)
                        Text(presenceText).font(.caption).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { Task { await model.leave() } } label: { Label("Leave", systemImage: "chevron.left") }
                        .labelStyle(.titleAndIcon)
                        .accessibilityIdentifier("chat.leave")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showMembers = true } label: { Label("\(model.presence)", systemImage: "person.2.fill") }
                        .labelStyle(.titleAndIcon)
                        .accessibilityLabel(presenceText)
                        .accessibilityIdentifier("chat.members")
                }
            }
            .sheet(isPresented: $showMembers) {
                MembersSheet(venueId: model.venueId, chat: model)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
    }

    private var presenceText: String {
        let n = model.presence
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
            Composer(draft: $draft, attachment: $attachment, disabled: model.isMuted, onCreatePoll: { showCreatePoll = true }) {
                let text = draft
                let photo = attachment
                draft = ""
                attachment = nil
                if let photo {
                    Task { await model.sendImage(photo.data, caption: text) }
                } else {
                    Task { await model.send(text) }
                }
            }
        }
        .fullScreenCover(item: $viewing) { image in ImageViewer(image: image) }
        .sheet(isPresented: $showCreatePoll) {
            CreatePollSheet { draft in
                showCreatePoll = false
                Task { await model.createPoll(draft) }
            }
            .presentationDetents([.large])
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.35), value: rows.map(\.id))
        .onChange(of: rows.count) { _, _ in
            // Pin to the newest row only when the user is already near the bottom.
            let nearBottom = scrolledId == nil || rows.suffix(3).contains { $0.id == scrolledId }
            if nearBottom { scrollToNewest(rows) }
        }
        // Our own actions always bring the newest row into view, even from far up the history.
        .onChange(of: model.pending.count) { _, count in if count > 0 { scrollToNewest(rows) } }
        .onChange(of: model.sentCount) { _, _ in scrollToNewest(rows) }
        .onChange(of: model.notices.count) { _, _ in scrollToNewest(rows) }
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

    /// Scrolls after the current layout pass so the row transition cannot swallow the request.
    private func scrollToNewest(_ rows: [ChatRow]) {
        guard let last = rows.last else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { scrolledId = last.id }
        }
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
            MessageRow(message: message, position: position, showHeader: showHeader && !mine, mine: mine, onOpenImage: { viewing = $0 })
                .contextMenu {
                    if !mine {
                        Button("Report", systemImage: "flag") { reporting = message }
                        Button("Block \(message.author.displayName)", systemImage: "hand.raised", role: .destructive) { blocking = message }
                    }
                }
                .padding(.top, showHeader ? Spacing.s : 0)
        case let .poll(message):
            if let poll = message.poll {
                let mine = message.author.id == model.myUserId
                PollRow(message: message, poll: poll, mine: mine, onVote: { optionId in Task { await model.vote(messageId: message.id, optionId: optionId) } }, onClose: { Task { await model.closePoll(messageId: message.id) } })
                    .contextMenu {
                        if !mine {
                            Button("Report", systemImage: "flag") { reporting = message }
                            Button("Block \(message.author.displayName)", systemImage: "hand.raised", role: .destructive) { blocking = message }
                        }
                    }
                    .padding(.vertical, Spacing.xs)
            } else {
                Bubble(text: message.text, mine: message.author.id == model.myUserId, position: .single, pending: false)
            }
        case let .notice(notice):
            NoticeChip(notice: notice).padding(.vertical, Spacing.xs)
        case let .pending(pending):
            Group {
                if let preview = pending.image {
                    ImageBubble(image: nil, preview: preview, caption: pending.text, mine: true, position: .single, pending: true, uploading: pending.uploading, onOpen: {})
                } else {
                    Bubble(text: pending.text, mine: true, position: .single, pending: true)
                }
            }
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
    var onOpenImage: (ImageAttachment) -> Void = { _ in }

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
                if message.kind == .image, let image = message.image {
                    ImageBubble(image: image, preview: nil, caption: message.caption ?? "", mine: mine, position: position, pending: false, uploading: false, onOpen: { onOpenImage(image) })
                        .accessibilityIdentifier("chat.image.\(message.id)")
                } else {
                    Bubble(text: message.text, mine: mine, position: position, pending: false)
                }
                if position == .single || position == .last {
                    Text(Self.time(message.createdAt)).font(.caption2).foregroundStyle(.tertiary).padding(.horizontal, 6)
                }
            }
            if !mine { Spacer(minLength: 60) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(message.kind == .image ? "Photo from \(message.author.displayName). \(message.caption ?? "")" : "\(message.author.displayName): \(message.text)")
    }

    private static func time(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.larea.date(from: iso) else { return "" }
        return date.formatted(date: .omitted, time: .shortened)
    }
}

/// Bubble corners: tight where a bubble joins the previous/next one from the same author.
enum BubbleShape {
    static func shape(mine: Bool, position: GroupPosition) -> UnevenRoundedRectangle {
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
}

private struct Bubble: View {
    let text: String
    let mine: Bool
    let position: GroupPosition
    let pending: Bool

    var body: some View {
        Text(text)
            .font(.body)
            .foregroundStyle(mine ? Color.white : Color.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(mine ? Color.brandPrimary : Color(.secondarySystemGroupedBackground), in: BubbleShape.shape(mine: mine, position: position))
            .opacity(pending ? 0.55 : 1)
            .frame(maxWidth: 300, alignment: mine ? .trailing : .leading)
    }
}

/// A photo message: thumbnail sized by its aspect ratio, optional caption, tap to view.
struct ImageBubble: View {
    let image: ImageAttachment?
    let preview: UIImage?
    let caption: String
    let mine: Bool
    let position: GroupPosition
    let pending: Bool
    let uploading: Bool
    let onOpen: () -> Void

    private static let width: CGFloat = 240

    private var height: CGFloat {
        let ratio = image?.aspectRatio ?? (preview.map { $0.size.width / max(1, $0.size.height) } ?? 1.33)
        return min(320, max(120, Self.width / max(0.2, ratio)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                if let preview {
                    Image(uiImage: preview).resizable().aspectRatio(contentMode: .fill)
                } else {
                    RemoteImage(url: image?.thumbURL)
                }
                if uploading {
                    ProgressView().tint(.white).padding(10).background(.black.opacity(0.35), in: Circle())
                }
            }
            .frame(width: Self.width, height: height)
            .clipped()
            if !caption.isEmpty {
                Text(caption)
                    .font(.body)
                    .foregroundStyle(mine ? Color.white : Color.primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(width: Self.width, alignment: .leading)
            }
        }
        .background(mine ? Color.brandPrimary : Color(.secondarySystemGroupedBackground))
        .clipShape(BubbleShape.shape(mine: mine, position: position))
        .opacity(pending ? 0.55 : 1)
        .onTapGesture { if image != nil { onOpen() } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption.isEmpty ? "Photo" : "Photo, \(caption)")
        .accessibilityAddTraits(.isButton)
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
    @Binding var attachment: ComposerAttachment?
    let disabled: Bool
    let onCreatePoll: () -> Void
    let onSend: () -> Void
    @State private var pickedItem: PhotosPickerItem?
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var pickError: String?

    private var canSend: Bool { !disabled && (attachment != nil || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
    private var placeholder: String {
        if disabled { return "You're muted for now" }
        return attachment == nil ? "Say something…" : "Add a caption…"
    }

    var body: some View {
        VStack(spacing: 4) {
            if let attachment {
                HStack(alignment: .top) {
                    Image(uiImage: attachment.preview)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                        .accessibilityIdentifier("chat.attach.preview")
                        .overlay(alignment: .topTrailing) {
                            Button { self.attachment = nil } label: {
                                Image(systemName: "xmark")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 22, height: 22)
                                    .background(.black.opacity(0.6), in: Circle())
                            }
                            .padding(4)
                            .accessibilityLabel("Remove photo")
                            .accessibilityIdentifier("chat.attach.remove")
                        }
                    Spacer()
                }
            }
            HStack(alignment: .bottom, spacing: Spacing.s) {
                Menu {
                    Button("Photo library", systemImage: "photo.on.rectangle") { showLibrary = true }
                        .accessibilityIdentifier("chat.attach.library")
                    if CameraPicker.isAvailable {
                        Button("Take photo", systemImage: "camera") { showCamera = true }
                            .accessibilityIdentifier("chat.attach.camera")
                    }
                    Button("Create poll", systemImage: "chart.bar") { onCreatePoll() }
                        .accessibilityIdentifier("chat.poll")
                    #if DEBUG
                    if UserDefaults.standard.bool(forKey: "LareaTestSeedImage") {
                        Button("Use test image", systemImage: "testtube.2") { attach(Self.testImage()) }
                            .accessibilityIdentifier("chat.attach.seed")
                    }
                    #endif
                } label: {
                    Image(systemName: "plus")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(Color.brandPrimary)
                        .frame(width: 38, height: 38)
                        .background(Color.brandTint, in: Circle())
                }
                .disabled(disabled)
                .accessibilityLabel("Add photo or poll")
                .accessibilityIdentifier("chat.attach")
                TextField(placeholder, text: $draft, axis: .vertical)
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
        .photosPicker(isPresented: $showLibrary, selection: $pickedItem, matching: .images, photoLibrary: .shared())
        .onChange(of: pickedItem) { _, item in
            guard let item else { return }
            pickedItem = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) { attach(data) } else { pickError = "That photo couldn't be read." }
            }
        }
        .fullScreenCover(isPresented: $showCamera) { CameraPicker(onImage: attach).ignoresSafeArea() }
        .alert("Photo", isPresented: Binding(get: { pickError != nil }, set: { if !$0 { pickError = nil } })) {
            Button("OK") { pickError = nil }
        } message: { Text(pickError ?? "") }
    }

    private func attach(_ data: Data) {
        guard let preview = UIImage(data: data) else {
            pickError = "That photo couldn't be read."
            return
        }
        attachment = ComposerAttachment(data: data, preview: preview)
    }

    #if DEBUG
    /// A deterministic picture for UI tests, drawn at runtime (nothing synthetic ships).
    private static func testImage() -> Data {
        let size = CGSize(width: 640, height: 480)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            let colors = [UIColor.systemIndigo.cgColor, UIColor.systemOrange.cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: CGRect(x: 220, y: 140, width: 200, height: 200))
        }
        return image.jpegData(compressionQuality: 0.9) ?? Data()
    }
    #endif
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
