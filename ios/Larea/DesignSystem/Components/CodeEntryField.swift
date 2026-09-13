import SwiftUI

/// Six digits, large and spaced, for the handover code.
struct CodeEntryField: View {
    @Binding var code: String
    var identifier = "code.field"

    var body: some View {
        TextField("000000", text: $code)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
            .kerning(8)
            .multilineTextAlignment(.center)
            .padding(.vertical, 14)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .onChange(of: code) { _, value in
                let digits = value.filter(\.isNumber)
                if digits != value || digits.count > 6 { code = String(digits.prefix(6)) }
            }
            .accessibilityIdentifier(identifier)
    }
}
