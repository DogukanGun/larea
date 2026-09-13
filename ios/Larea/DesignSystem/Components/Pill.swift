import SwiftUI

struct Pill: View {
    enum Style { case sunny, tint, success, neutral }

    let text: String
    var style: Style = .tint
    var symbol: String?

    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).font(.caption2.weight(.bold)) }
            Text(text).font(.lareaCaptionBold)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(background, in: Capsule())
        .foregroundStyle(foreground)
    }

    private var background: Color {
        switch style {
        case .sunny: return .sunny
        case .tint: return .brandTint
        case .success: return Color.success.opacity(0.15)
        case .neutral: return Color(.tertiarySystemFill)
        }
    }

    private var foreground: Color {
        switch style {
        case .sunny: return Color(red: 0.30, green: 0.18, blue: 0.0)
        case .tint: return .brandDeep
        case .success: return .success
        case .neutral: return .secondary
        }
    }
}
