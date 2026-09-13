import SwiftUI

struct PrimaryButton: View {
    let title: String
    var isLoading = false
    var isEnabled = true
    var identifier: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).font(.lareaButton).opacity(isLoading ? 0 : 1)
                if isLoading { ProgressView().tint(.white) }
            }
            .frame(maxWidth: .infinity, minHeight: 30)
            .padding(.vertical, Spacing.s)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: Radius.button))
        .tint(.brandPrimary)
        .disabled(!isEnabled || isLoading)
        .accessibilityLabel(title)
        .accessibilityIdentifier(identifier ?? "button.\(title)")
    }
}

struct SecondaryButton: View {
    let title: String
    var isEnabled = true
    var identifier: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.lareaButton)
                .frame(maxWidth: .infinity, minHeight: 30)
                .padding(.vertical, Spacing.s)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle(radius: Radius.button))
        .tint(.brandPrimary)
        .disabled(!isEnabled)
        .accessibilityIdentifier(identifier ?? "button.\(title)")
    }
}

/// Small text-only action used under forms ("New here? Create an account").
struct LinkButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .font(.subheadline.weight(.semibold))
            .tint(.brandPrimary)
            .frame(maxWidth: .infinity)
    }
}
