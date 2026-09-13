import SwiftUI

/// Who is in the chat right now. Refetched whenever the head count changes.
struct MembersSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let venueId: String
    let chat: ChatViewModel
    @State private var members: [Member] = []
    @State private var count = 0
    @State private var loading = true
    @State private var error: String?
    @State private var blocking: Member?
    @State private var reload: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if loading, members.isEmpty {
                        ForEach(0..<3, id: \.self) { _ in MemberRow(name: "Placeholder", seed: "-").redacted(reason: .placeholder) }
                    } else if members.isEmpty, let error {
                        ContentUnavailableView {
                            Label("Can't load people", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                        }
                    } else if members.isEmpty {
                        ContentUnavailableView("Just you for now", systemImage: "person.2", description: Text("People who join this chat show up here."))
                    } else {
                        ForEach(members) { member in
                            MemberRow(name: member.displayName, seed: member.id, isMe: member.id == chat.myUserId)
                                .accessibilityIdentifier("members.row.\(member.id)")
                                .contextMenu {
                                    if member.id != chat.myUserId {
                                        Button("Block \(member.displayName)", systemImage: "hand.raised", role: .destructive) { blocking = member }
                                    }
                                }
                        }
                    }
                } footer: {
                    if count > members.count, !loading {
                        Text("\(count - members.count) more you can't see because of blocks.").font(.caption2)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(count == 1 ? "1 person here" : "\(count) people here")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.accessibilityIdentifier("members.done")
                }
            }
            .confirmationDialog("Block \(blocking?.displayName ?? "")?", isPresented: Binding(get: { blocking != nil }, set: { if !$0 { blocking = nil } }), titleVisibility: .visible) {
                Button("Block", role: .destructive) {
                    if let member = blocking {
                        Task {
                            await chat.block(Author(id: member.id, displayName: member.displayName))
                            members.removeAll { $0.id == member.id }
                        }
                    }
                    blocking = nil
                }
                Button("Cancel", role: .cancel) { blocking = nil }
            } message: {
                Text("You won't see each other's messages. They won't be told.")
            }
        }
        .task { await load() }
        .task {
            for await event in env.realtime.events() {
                if case let .presence(id, _) = event, id == venueId { scheduleReload() }
            }
        }
    }

    private func scheduleReload() {
        reload?.cancel()
        reload = Task {
            try? await Task.sleep(for: .milliseconds(500))
            if !Task.isCancelled { await load() }
        }
    }

    private func load() async {
        do {
            let response: MembersResponse = try await env.api.send(APIRequest(.GET, "venues/\(venueId)/members"))
            members = response.members
            count = response.count
            error = nil
        } catch {
            if (error as? APIError)?.code == "NOT_MEMBER" { dismiss() }
            self.error = error.userMessage
        }
        loading = false
    }
}
