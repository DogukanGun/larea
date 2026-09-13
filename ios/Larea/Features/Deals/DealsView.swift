import SwiftUI

/// Offers and orders. Placeholder until the marketplace ships.
struct DealsView: View {
    var body: some View {
        ContentUnavailableView("No deals yet", systemImage: "tag", description: Text("Offers you make or receive show up here."))
            .accessibilityIdentifier("deals.root")
            .navigationTitle("Deals")
    }
}
