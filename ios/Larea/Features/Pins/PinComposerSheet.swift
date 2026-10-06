import CoreLocation
import MapKit
import Observation
import SwiftUI

@MainActor
@Observable
final class PinComposerViewModel: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var text = ""
    private(set) var quote: PinQuote?
    /// The text the quote was made for; editing it afterwards needs a new quote (it is moderated again).
    private var quotedText: String?
    var quoting = false
    var buying = false
    var error: String?
    var pendingApproval = false

    static let maxLength = 500

    private let api: APIClient
    private let location: LocationService
    private let store: PinStore

    init(coordinate: CLLocationCoordinate2D, api: APIClient, location: LocationService, store: PinStore) {
        self.coordinate = coordinate
        self.api = api
        self.location = location
        self.store = store
    }

    var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    var currentQuote: PinQuote? { quotedText == trimmed ? quote : nil }
    var canQuote: Bool { !trimmed.isEmpty && trimmed.count <= Self.maxLength && !quoting && !buying }

    func price(of quote: PinQuote) -> String { store.displayPrice(for: quote) }

    func requestQuote() async {
        guard canQuote else { return }
        guard let fix = location.latestFix else {
            error = "We need your location to price this pin. Please try again in a moment."
            return
        }
        quoting = true
        error = nil
        defer { quoting = false }
        do {
            let body = PinQuoteRequest(
                lat: coordinate.latitude,
                lng: coordinate.longitude,
                text: trimmed,
                fix: LocationFixBody(lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM, mocked: fix.mocked)
            )
            quote = try await api.send(try APIRequest(.POST, "pins/quote", json: body))
            quotedText = trimmed
            if store.products.isEmpty { await store.loadProducts() }
        } catch {
            self.error = error.userMessage
        }
    }

    /// Returns the live pin when the purchase went through.
    func buy() async -> MessagePin? {
        guard let quote = currentQuote, !buying else { return nil }
        buying = true
        error = nil
        defer { buying = false }
        do {
            switch try await store.purchase(quote) {
            case let .activated(pin): return pin
            case .cancelled: return nil
            case .pending:
                pendingApproval = true
                return nil
            }
        } catch {
            self.error = error.userMessage
            return nil
        }
    }
}

/// Write a message, see what pinning it here costs, and buy it. The price depends on where you are:
/// near you, in your city, in your country, or abroad.
struct PinComposerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var model: PinComposerViewModel
    @FocusState private var focused: Bool
    let onPinned: (MessagePin) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.l) {
                    Map(initialPosition: .region(MKCoordinateRegion(center: model.coordinate, latitudinalMeters: 600, longitudinalMeters: 600)), interactionModes: []) {
                        Annotation("", coordinate: model.coordinate) { PinMarker(selected: true) }
                    }
                    .frame(height: 140)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .allowsHitTesting(false)

                    VStack(alignment: .leading, spacing: Spacing.s) {
                        TextField("What do you want to tell people here?", text: $model.text, axis: .vertical)
                            .lineLimit(3...8)
                            .focused($focused)
                            .padding(Spacing.m)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                            .accessibilityIdentifier("pin.composer.text")
                        Text("\(model.text.count)/\(PinComposerViewModel.maxLength)")
                            .font(.caption2)
                            .foregroundStyle(model.text.count > PinComposerViewModel.maxLength ? Color.danger : .secondary)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }

                    if let quote = model.currentQuote {
                        QuoteCard(quote: quote, price: model.price(of: quote))
                        if let notice = quote.notice { NoteCard(symbol: "exclamationmark.bubble.fill", text: notice) }
                        PrimaryButton(title: "Pin for \(model.price(of: quote))", isLoading: model.buying, identifier: "pin.composer.buy") {
                            Task {
                                if let pin = await model.buy() {
                                    dismiss()
                                    onPinned(pin)
                                }
                            }
                        }
                        Text("One-time purchase. Your message and its chat stay on the map for \(quote.durationText). You run the chat: hide messages, remove people and edit your message.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        PrimaryButton(title: "See price", isLoading: model.quoting, isEnabled: model.canQuote, identifier: "pin.composer.quote") {
                            focused = false
                            Task { await model.requestQuote() }
                        }
                        PriceGuide()
                    }

                    if let error = model.error { InlineError(text: error) }
                }
                .padding(Spacing.screen)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Pin a message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .alert("Waiting for approval", isPresented: $model.pendingApproval) {
                Button("OK") { dismiss() }
            } message: {
                Text("Your pin goes live as soon as the purchase is approved.")
            }
            .onAppear { focused = true }
        }
    }
}

private struct QuoteCard: View {
    let quote: PinQuote
    let price: String

    var body: some View {
        HStack(spacing: Spacing.m) {
            Image(systemName: quote.tier.symbol)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(Color.brandPrimary, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(quote.tier.title).font(.lareaHeadline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            Text(price).font(.lareaTitle3)
        }
        .padding(Spacing.l)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("pin.composer.quote.\(quote.tier.rawValue)")
    }

    private var detail: String {
        switch quote.tier {
        case .nearby: return "Within 1 km of you · \(quote.durationText)"
        case .city: return "\(quote.targetCity.map { "In \($0)" } ?? "Same city") · \(quote.durationText)"
        case .country: return "\(quote.targetCity.map { "In \($0)" } ?? "Same country") · \(quote.durationText)"
        case .world: return "\(quote.targetCity.map { "In \($0)" } ?? "Another country") · \(quote.durationText)"
        }
    }
}

/// What each distance costs, shown before the first quote.
private struct PriceGuide: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            row(.nearby, "$3.99", "24 hours")
            row(.city, "$10.99", "3 days")
            row(.country, "$29.99", "3 days")
            row(.world, "$39.99", "7 days")
        }
        .padding(Spacing.l)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }

    private func row(_ tier: PinTier, _ price: String, _ duration: String) -> some View {
        HStack {
            Label(tier.title, systemImage: tier.symbol).font(.subheadline)
            Spacer()
            Text("\(price) · \(duration)").font(.subheadline).foregroundStyle(.secondary)
        }
    }
}

/// The map marker for a message pin: a speech bubble, unlike the round place markers.
struct PinMarker: View {
    var selected = false
    var mine = false

    var body: some View {
        Image(systemName: "text.bubble.fill")
            .font(.system(size: selected ? 20 : 16, weight: .bold))
            .foregroundStyle(Color(red: 0.30, green: 0.18, blue: 0.0))
            .frame(width: selected ? 46 : 36, height: selected ? 46 : 36)
            .background(Color.sunny, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(mine ? Color.brandPrimary : .white, lineWidth: 2))
            .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
    }
}
