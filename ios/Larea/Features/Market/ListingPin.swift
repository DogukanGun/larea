import SwiftUI

/// Map annotation for a listing: the price in a capsule, category glyph when selected.
struct ListingPin: View {
    let listing: Listing
    let selected: Bool

    var body: some View {
        VStack(spacing: 2) {
            PriceTag(cents: listing.priceCents, currency: listing.currency, size: selected ? .large : .small, style: selected ? .sunny : (listing.kind == .request ? .plain : .filled))
            if selected {
                Text(listing.title)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.bar, in: Capsule())
            }
        }
        .animation(.spring(duration: 0.25), value: selected)
        .accessibilityLabel("\(listing.title), \(Money.format(cents: listing.priceCents, currency: listing.currency))")
    }
}
