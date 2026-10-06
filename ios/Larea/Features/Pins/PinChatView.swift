import SwiftUI

/// A message pin: the pinned message as a card, the chat under it, and the owner's tools.
struct PinChatView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let pinId: String
    @State private var model: PinChatViewModel?
    @State private var editing = false
    @State private var editText = ""
    @State private var reporting: PinMessage?
    @State private var reportingPin = false
    @State private var removing: Author?

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationTitle("Pinned message")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil {
                let created = PinChatViewModel(pinId: pinId, api: env.api, realtime: env.realtime, location: env.location)
                model = created
                created.start()
            }
        }
        .onDisappear {
            model?.stop()
            model = nil
        }
    }

    @ViewBuilder
    private func content(_ model: PinChatViewModel) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Spacing.s) {
                    if let pin = model.pin {
                        PinnedCard(pin: pin).padding(.bottom, Spacing.s).id("pin")
                    } else if model.loading {
                        ProgressView().frame(maxWidth: .infinity).padding(Spacing.xl)
                    }
                    if let closed = model.closedMessage {
                        NoteCard(symbol: "clock.badge.xmark", text: closed)
                    } else if let pin = model.pin, !pin.canChat {
                        NoteCard(symbol: "figure.walk", text: "Get within 300 m of this pin to read and join its chat.\(pin.distanceText.map { " You're about \($0) away." } ?? "")")
                    } else if model.messages.isEmpty, !model.loading, model.pin != nil {
                        Text(model.isOwner ? "Your chat is open. People near the pin can write here." : "No messages yet. Say hello!")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.l)
                    }
                    ForEach(model.messages) { message in
                        PinMessageRow(message: message, mine: message.author.id == env.session.session?.user.id, ownerId: model.pin?.owner.id)
                            .id(message.id)
                            .contextMenu { menu(for: message, model: model) }
                    }
                }
                .padding(Spacing.screen)
            }
            .background(Color(.systemGroupedBackground))
            .refreshable { await model.load() }
            .onChange(of: model.messages.last?.id) { _, id in
                guard let id else { return }
                withAnimation { proxy.scrollTo(id, anchor: .bottom) }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.canChat {
                PinComposer(text: Bindable(model).draft, sending: model.sending) { Task { await model.send() } }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if model.isOwner {
                        Button("Edit message", systemImage: "pencil") {
                            editText = model.pin?.text ?? ""
                            editing = true
                        }
                    } else {
                        Button("Report pin", systemImage: "flag") { reportingPin = true }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .disabled(model.pin == nil)
            }
        }
        .alert("Edit your message", isPresented: $editing) {
            TextField("Message", text: $editText, axis: .vertical)
            Button("Save") { Task { _ = await model.edit(editText.trimmingCharacters(in: .whitespacesAndNewlines)) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your edit is checked against the community guidelines like any message.")
        }
        .confirmationDialog("Remove \(removing?.displayName ?? "") from this chat?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let author = removing { Task { await model.removeFromChat(author) } }
            }
        } message: {
            Text("They won't see this pin or be able to write here again.")
        }
        .sheet(item: $reporting) { message in
            ReportSheet { reason in
                reporting = nil
                Task { await model.report(message, reason: reason) }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $reportingPin) {
            ReportSheet { reason in
                reportingPin = false
                Task { await model.reportPin(reason: reason) }
            }
            .presentationDetents([.medium, .large])
        }
        .alert("Something went wrong", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("OK") { model.error = nil }
        } message: { Text(model.error ?? "") }
        .alert("", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
    }

    @ViewBuilder
    private func menu(for message: PinMessage, model: PinChatViewModel) -> some View {
        let mine = message.author.id == env.session.session?.user.id
        if model.isOwner, !mine {
            Button("Hide message", systemImage: "eye.slash") { Task { await model.hide(message) } }
            Button("Remove from chat", systemImage: "person.fill.xmark", role: .destructive) { removing = message.author }
        } else if model.isOwner {
            Button("Hide message", systemImage: "eye.slash") { Task { await model.hide(message) } }
        }
        if !mine {
            Button("Report", systemImage: "flag") { reporting = message }
        }
    }
}

private struct PinnedCard: View {
    let pin: MessagePin

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            HStack(spacing: Spacing.s) {
                Avatar(name: pin.owner.displayName, seed: pin.owner.id, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(pin.owner.displayName).font(.subheadline.weight(.semibold))
                    Text(pin.mine ? "You run this chat" : "Runs this chat").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Pill(text: pin.tier.title, style: .sunny, symbol: "pin.fill")
            }
            Text(pin.text).font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("pin.chat.text")
            HStack(spacing: Spacing.m) {
                if let expires = pin.expiresDate {
                    Label(expires > .now ? "Ends \(expires.formatted(.relative(presentation: .named)))" : "Ended", systemImage: "clock")
                }
                if pin.editedAt != nil { Text("Edited") }
                if let distance = pin.distanceText, !pin.mine { Label(distance, systemImage: "location") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(Spacing.l)
        .background(Color.sunny.opacity(0.35), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Color.sunny, lineWidth: 1.5))
    }
}

private struct PinMessageRow: View {
    let message: PinMessage
    let mine: Bool
    let ownerId: String?

    var body: some View {
        HStack(alignment: .bottom, spacing: Spacing.s) {
            if mine { Spacer(minLength: 60) } else { Avatar(name: message.author.displayName, seed: message.author.id, size: 30) }
            VStack(alignment: mine ? .trailing : .leading, spacing: 3) {
                if !mine {
                    HStack(spacing: 4) {
                        Text(message.author.displayName).font(.caption.weight(.semibold))
                            .foregroundStyle(Avatar.palette[Avatar.colorIndex(for: message.author.id)])
                        if message.author.id == ownerId { Pill(text: "Admin", style: .tint) }
                    }
                    .padding(.leading, 6)
                }
                Text(message.text)
                    .foregroundStyle(mine ? Color.white : Color.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(mine ? Color.brandPrimary : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.bubble, style: .continuous))
                if let date = ISO8601DateFormatter.larea.date(from: message.createdAt) {
                    Text(date.formatted(date: .omitted, time: .shortened)).font(.caption2).foregroundStyle(.tertiary).padding(.horizontal, 6)
                }
            }
            if !mine { Spacer(minLength: 60) }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct PinComposer: View {
    @Binding var text: String
    let sending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(alignment: .bottom, spacing: Spacing.s) {
            TextField("Message", text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .accessibilityIdentifier("pin.chat.composer")
            Button(action: onSend) {
                Group {
                    if sending { ProgressView().tint(.white) } else { Image(systemName: "arrow.up").font(.headline.weight(.bold)) }
                }
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Color.brandPrimary, in: Circle())
            }
            .disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel("Send")
            .accessibilityIdentifier("pin.chat.send")
        }
        .padding(.horizontal, Spacing.screen)
        .padding(.vertical, Spacing.s)
        .background(.bar)
    }
}
