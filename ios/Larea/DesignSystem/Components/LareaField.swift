import SwiftUI

/// Fields used across sign-in, sign-up and settings share one focus enum.
enum FormField: Hashable {
    case displayName, email, password
}

/// Label above, 52pt filled field, optional error line. Secure fields get a reveal toggle
/// that keeps focus by re-requesting it after the swap.
struct LareaField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var isSecure = false
    var error: String?
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var submitLabel: SubmitLabel = .next
    var focus: FocusState<FormField?>.Binding
    let field: FormField
    var identifier: String? = nil
    var onSubmit: () -> Void = {}

    @State private var reveal = false

    private var isFocused: Bool { focus.wrappedValue == field }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote.weight(.medium)).foregroundStyle(.secondary)
            HStack(spacing: Spacing.s) {
                Group {
                    if isSecure && !reveal {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text)
                    }
                }
                .focused(focus, equals: field)
                .keyboardType(keyboard)
                .textContentType(contentType)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .onSubmit(onSubmit)
                .font(.body)
                .accessibilityIdentifier(identifier ?? "field.\(field)")

                if isSecure {
                    Button {
                        reveal.toggle()
                        Task { @MainActor in focus.wrappedValue = field }
                    } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(.secondary)
                    }
                    .accessibilityLabel(reveal ? "Hide password" : "Show password")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 52)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.field, style: .continuous)
                    .strokeBorder(error != nil ? Color.danger : (isFocused ? Color.brandPrimary : .clear), lineWidth: 1.5)
            )
            .animation(.easeOut(duration: 0.15), value: isFocused)

            if let error {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.danger)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: error)
    }
}
