import SwiftUI

/// Question, two to six options and an optional duration; posts into the current chat.
struct CreatePollSheet: View {
    let onSubmit: (PollDraft) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft = PollDraft()
    @State private var attempted = false
    @FocusState private var focusedOption: Int?

    private var problem: String? { PollValidation.validate(draft) }

    var body: some View {
        NavigationStack {
            List {
                Section("Question") {
                    TextField("What do you want to ask?", text: $draft.question, axis: .vertical)
                        .lineLimit(1...3)
                        .accessibilityIdentifier("poll.question")
                }
                Section {
                    ForEach(draft.options.indices, id: \.self) { index in
                        TextField("Option \(index + 1)", text: $draft.options[index])
                            .focused($focusedOption, equals: index)
                            .accessibilityIdentifier("poll.option.\(index)")
                            .submitLabel(index == draft.options.count - 1 ? .done : .next)
                            .onSubmit { if index < draft.options.count - 1 { focusedOption = index + 1 } }
                    }
                    .onDelete { offsets in
                        guard draft.options.count > PollValidation.minOptions else { return }
                        draft.options.remove(atOffsets: offsets)
                    }
                    if draft.options.count < PollValidation.maxOptions {
                        Button("Add option", systemImage: "plus.circle.fill") {
                            draft.options.append("")
                            focusedOption = draft.options.count - 1
                        }
                        .accessibilityIdentifier("poll.addOption")
                    }
                } header: {
                    Text("Options")
                } footer: {
                    Text("Swipe an option to remove it. Everyone in the chat can vote once and change their mind while the poll is open.")
                }
                Section("Closes") {
                    Picker("Closes", selection: $draft.duration) {
                        ForEach(PollDuration.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("poll.duration")
                }
                if attempted, let problem {
                    Section { InlineError(text: problem).listRowBackground(Color.clear) }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("New poll")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Post") {
                        attempted = true
                        guard problem == nil else { return }
                        onSubmit(PollValidation.cleaned(draft))
                    }
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("poll.submit")
                }
            }
        }
    }
}
