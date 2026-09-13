import SwiftUI

/// Propose a price (or an amount for help), with an optional note to the other side.
struct OfferSheet: View {
    let listing: Listing
    let onSubmit: (Int, String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var amountText = ""
    @State private var note = ""
    @State private var attempted = false

    private var amountCents: Int? { Money.parse(amountText) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ListingCard(listing: listing, layout: .compact).listRowBackground(Color.clear)
                }
                Section(listing.kind == .request ? "Your price for the job" : "Your offer") {
                    HStack {
                        TextField(Money.format(cents: listing.priceCents, currency: listing.currency), text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.lareaTitle2)
                            .accessibilityIdentifier("market.offer.amount")
                        Text(listing.currency.uppercased()).foregroundStyle(.secondary)
                    }
                    if attempted, amountCents == nil { InlineError(text: "Enter an amount.").listRowBackground(Color.clear) }
                }
                Section("Note (optional)") {
                    TextField(listing.kind == .request ? "When can you help?" : "When could you pick it up?", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                        .accessibilityIdentifier("market.offer.note")
                }
                Section {
                    PrimaryButton(title: "Send offer", identifier: "market.offer.submit") {
                        attempted = true
                        guard let amountCents else { return }
                        onSubmit(amountCents, note.trimmingCharacters(in: .whitespacesAndNewlines))
                        dismiss()
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 8, trailing: 0))
                } footer: {
                    Text(listing.kind == .request ? "The neighbour can accept or decline. Payment happens in the app once they accept." : "The seller can accept or decline. You only pay after they accept.")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(listing.kind == .request ? "Offer to help" : "Make an offer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear { if amountText.isEmpty { amountText = String(format: listing.priceCents % 100 == 0 ? "%.0f" : "%.2f", Double(listing.priceCents) / 100) } }
        }
    }
}
