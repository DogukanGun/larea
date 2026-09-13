import SwiftUI

/// A listing in a list row (thumbnail left), a card (photo on top) or a compact line.
struct ListingCard: View {
    enum Layout { case row, card, compact }

    let listing: Listing
    var layout: Layout = .row

    var body: some View {
        switch layout {
        case .row: row
        case .card: card
        case .compact: compact
        }
    }

    private var thumb: some View {
        RemoteImage(url: listing.images.first?.thumbURL)
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
    }

    private var meta: String {
        [listing.category.label, listing.distanceText].compactMap { $0 }.joined(separator: " · ")
    }

    private var row: some View {
        HStack(spacing: Spacing.m) {
            thumb
            VStack(alignment: .leading, spacing: 4) {
                Text(listing.title).font(.lareaHeadline).foregroundStyle(.primary).lineLimit(2)
                Text(meta).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                HStack(spacing: Spacing.s) {
                    PriceTag(cents: listing.priceCents, currency: listing.currency, style: .plain)
                    Pill(text: listing.kind.label, style: listing.kind == .request ? .sunny : .neutral)
                    if listing.status != .active { Pill(text: listing.status.label, style: .neutral) }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            RemoteImage(url: listing.images.first?.thumbURL)
                .frame(maxWidth: .infinity)
                .aspectRatio(4 / 3, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            Text(listing.title).font(.lareaTitle3).lineLimit(2)
            Text(meta).font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: Spacing.s) {
                PriceTag(cents: listing.priceCents, currency: listing.currency, size: .large, style: .plain)
                Pill(text: listing.kind.label, style: listing.kind == .request ? .sunny : .neutral)
            }
        }
    }

    private var compact: some View {
        HStack(spacing: Spacing.s) {
            RemoteImage(url: listing.images.first?.thumbURL)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(listing.title).font(.subheadline.weight(.semibold)).lineLimit(1)
            Spacer()
            Text(Money.format(cents: listing.priceCents, currency: listing.currency)).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
