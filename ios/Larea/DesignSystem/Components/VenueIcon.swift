import SwiftUI

struct VenueIcon: View {
    let category: VenueCategory
    var size: CGFloat = 44
    var dimmed = false

    var body: some View {
        Image(systemName: category.symbol)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(dimmed ? Color.secondary : Color.brandPrimary)
            .frame(width: size, height: size)
            .background(dimmed ? Color(.tertiarySystemFill) : Color.brandTint, in: Circle())
            .accessibilityHidden(true)
    }
}

/// Large tinted symbol used at the top of explainer screens.
struct HeroGlyph: View {
    let symbol: String

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 42, weight: .bold))
            .foregroundStyle(Color.brandPrimary)
            .frame(width: 96, height: 96)
            .background(Color.brandTint, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .accessibilityHidden(true)
    }
}
