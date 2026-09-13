import SwiftUI

struct MyListingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    @State private var listings: [Listing] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading, listings.isEmpty {
                ForEach(0..<3, id: \.self) { _ in Text("Loading listings").redacted(reason: .placeholder) }
            } else if listings.isEmpty {
                ContentUnavailableView {
                    Label("No listings yet", systemImage: "storefront")
                } description: {
                    Text("Sell something or ask neighbours for help from the Market tab.")
                } actions: {
                    Button("Go to Market") { router.tab = .market }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                }
                .listRowBackground(Color.clear)
            } else {
                ForEach(listings) { listing in
                    Button { router.profilePath.append(.listing(listing.id)) } label: { ListingCard(listing: listing, layout: .row) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profile.listing.\(listing.id)")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("My listings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        if let me: MarketMeResponse = try? await env.api.send(APIRequest(.GET, "market/me")) { listings = me.listings }
        loading = false
    }
}
