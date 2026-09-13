import SwiftUI

/// Neighbourhood marketplace. Placeholder until the backend advertises `features.market`.
struct MarketView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            if env.session.session?.user.capabilities.market == true {
                ContentUnavailableView("Market", systemImage: "storefront.fill", description: Text("Buying, selling and asking for help nearby is on its way."))
            } else {
                ContentUnavailableView("Market coming soon", systemImage: "storefront", description: Text("Buy, sell and ask for help within 2 km."))
            }
        }
        .accessibilityIdentifier("market.root")
        .navigationTitle("Market")
    }
}
