import SwiftUI

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: ProfileViewModel?
    @State private var name = ""
    @State private var confirmDelete = false
    @FocusState private var focus: FormField?

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil { model = ProfileViewModel(api: env.api, sessions: env.sessions) }
            name = env.session.session?.user.displayName ?? ""
            Task { await model?.loadBlocks() }
        }
    }

    @ViewBuilder
    private func content(_ model: ProfileViewModel) -> some View {
        @Bindable var model = model
        let user = env.session.session?.user
        let current = user?.displayName ?? ""
        let nameError = name.trimmingCharacters(in: .whitespaces) == current ? nil : Validation.displayName(name)

        List {
            Section {
                HStack(spacing: Spacing.l) {
                    Avatar(name: current, seed: user?.id ?? "", size: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(current).font(.lareaTitle3).accessibilityIdentifier("profile.name")
                        Text(user?.email ?? "").font(.subheadline).foregroundStyle(.secondary)
                        if user?.ageVerified == true {
                            Pill(text: "18+ verified", style: .success, symbol: "checkmark.seal.fill")
                        }
                    }
                }
                .padding(.vertical, Spacing.s)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
            }

            Section("Display name") {
                LareaField(label: "Shown to people in chats", text: $name, placeholder: "Display name", error: nameError, contentType: .nickname, submitLabel: .done, focus: $focus, field: .displayName)
                    .listRowInsets(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                PrimaryButton(title: "Save", isLoading: model.busy, isEnabled: nameError == nil && name.trimmingCharacters(in: .whitespaces) != current) {
                    focus = nil
                    Task { await model.saveDisplayName(name) }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 12, trailing: 20))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            Section("Blocked people") {
                if model.blocks.isEmpty {
                    Text("You haven't blocked anyone.").foregroundStyle(.secondary)
                }
                ForEach(model.blocks) { blocked in
                    HStack(spacing: Spacing.m) {
                        Avatar(name: blocked.displayName, seed: blocked.id, size: 32)
                        Text(blocked.displayName)
                        Spacer()
                        Button("Unblock") { Task { await model.unblock(blocked) } }
                            .font(.subheadline.weight(.semibold))
                            .disabled(model.busy)
                    }
                }
            }

            Section {
                Button("Sign out") { Task { await model.signOut() } }.disabled(model.busy)
                Button("Delete account", role: .destructive) { confirmDelete = true }.disabled(model.busy)
            } footer: {
                Text("Deleting removes your profile immediately. Chats are ephemeral and are purged automatically.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .alert("Delete account", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive) { Task { await model.deleteAccount() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Delete your account? Your profile is removed immediately and cannot be restored.")
        }
        .alert("Profile", isPresented: Binding(get: { model.message != nil }, set: { if !$0 { model.message = nil } })) {
            Button("OK") { model.message = nil }
        } message: { Text(model.message ?? "") }
    }
}
