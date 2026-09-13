import SwiftUI

/// A price in a capsule: filled (map pins), plain (lists) or sunny (selected pin).
struct PriceTag: View {
    enum Size { case small, large }
    enum Style { case filled, plain, sunny }

    let cents: Int
    var currency = "eur"
    var size: Size = .small
    var style: Style = .filled

    private var background: Color {
        switch style {
        case .filled: return .brandPrimary
        case .plain: return .brandTint
        case .sunny: return .sunny
        }
    }

    private var foreground: Color {
        switch style {
        case .filled: return .white
        case .plain: return .brandDeep
        case .sunny: return Color(red: 0.30, green: 0.18, blue: 0.0)
        }
    }

    var body: some View {
        Text(Money.format(cents: cents, currency: currency))
            .font(size == .large ? .lareaTitle2 : .lareaCaptionBold)
            .monospacedDigit()
            .foregroundStyle(foreground)
            .padding(.horizontal, size == .large ? 14 : 9)
            .padding(.vertical, size == .large ? 8 : 4)
            .background(background, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.white.opacity(style == .filled ? 0.9 : 0), lineWidth: 2))
            .shadow(color: .black.opacity(style == .filled ? 0.18 : 0), radius: 4, y: 2)
    }
}
