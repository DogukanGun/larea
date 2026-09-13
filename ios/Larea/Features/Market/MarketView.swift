import MapKit
import SwiftUI

/// Neighbourhood marketplace: listings within 2 km on a map or in a list.
struct MarketView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    @State private var model: MarketViewModel?
    @State private var camera: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var mapSelection: String?
    @State private var detent: PanelDetent = .medium
    @State private var showFilters = false
    @State private var showCreate = false
    @State private var didFitOnce = false

    var body: some View {
        Group {
            if env.session.session?.user.capabilities.market != true {
                ContentUnavailableView("Market coming soon", systemImage: "storefront", description: Text("Buy, sell and ask for help within 2 km."))
                    .accessibilityIdentifier("market.root")
            } else if let model {
                content(model)
            } else {
                ProgressView()
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if model == nil { model = MarketViewModel(api: env.api, location: env.location) }
            model?.start()
        }
        .onDisappear { model?.stop() }
    }

    @ViewBuilder
    private func content(_ model: MarketViewModel) -> some View {
        @Bindable var model = model
        ZStack(alignment: .bottom) {
            Group {
                if model.mode == .map {
                    map(model)
                } else {
                    listingList(model)
                }
            }
            if model.mode == .map {
                BottomPanel(detent: $detent) {
                    panelHeader(model)
                } content: {
                    if let listing = model.selectedListing {
                        selectedCard(listing, model: model)
                    } else {
                        listingList(model)
                    }
                }
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) { topBar(model) }
        .sheet(isPresented: $showFilters) {
            FilterSheet(filters: model.filters) { model.setFilters($0) }
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showCreate) {
            CreateListingView(config: model.config) { listing in
                showCreate = false
                model.insert(listing)
                router.marketPath.append(.listing(listing.id))
            }
        }
        .alert("Market", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
        .onChange(of: mapSelection) { _, id in if let id, id != model.selectedId { model.selectedId = id } }
        .onChange(of: model.selectedId) { _, id in
            if mapSelection != id { mapSelection = id }
            guard let listing = model.listings.first(where: { $0.id == id }) else { return }
            withAnimation(.easeInOut(duration: 0.4)) {
                camera = .region(MKCoordinateRegion(center: listing.coordinate, latitudinalMeters: 900, longitudinalMeters: 900))
            }
            detent = .medium
        }
        .onChange(of: model.listings.map(\.id)) { _, _ in fitIfNeeded(model) }
    }

    private func topBar(_ model: MarketViewModel) -> some View {
        @Bindable var model = model
        return VStack(spacing: Spacing.s) {
            HStack(spacing: Spacing.s) {
                HStack(spacing: 8) {
                    Image(systemName: "storefront.fill").foregroundStyle(Color.brandPrimary)
                    Text("Market").font(.system(size: 22, weight: .heavy, design: .rounded)).accessibilityIdentifier("market.root")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.bar, in: Capsule())
                Spacer()
                Picker("Mode", selection: $model.mode) {
                    Image(systemName: "map.fill").tag(MarketViewModel.Mode.map)
                    Image(systemName: "list.bullet").tag(MarketViewModel.Mode.list)
                }
                .pickerStyle(.segmented)
                .frame(width: 96)
                .accessibilityIdentifier("market.mode")
                Button { showFilters = true } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.headline)
                        .foregroundStyle(Color.brandPrimary)
                        .frame(width: 44, height: 44)
                        .background(.bar, in: Circle())
                        .overlay(alignment: .topTrailing) {
                            if model.filters.isActive { Circle().fill(Color.sunny).frame(width: 10, height: 10).offset(x: -4, y: 4) }
                        }
                }
                .accessibilityLabel("Filters")
                .accessibilityIdentifier("market.filter")
                Button { showCreate = true } label: {
                    Image(systemName: "plus")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.brandPrimary, in: Circle())
                }
                .accessibilityLabel("Post a listing")
                .accessibilityIdentifier("market.create")
            }
            HStack(spacing: Spacing.s) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search nearby listings", text: Binding(get: { model.filters.query }, set: { value in
                    var next = model.filters
                    next.query = value
                    model.setFilters(next)
                }))
                .textInputAutocapitalization(.never)
                .accessibilityIdentifier("market.search")
                if !model.filters.query.isEmpty {
                    Button {
                        var next = model.filters
                        next.query = ""
                        model.setFilters(next)
                    } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.bar, in: Capsule())
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func map(_ model: MarketViewModel) -> some View {
        Map(position: $camera, selection: $mapSelection) {
            UserAnnotation()
            if let fix = env.location.latestFix {
                MapCircle(center: CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lng), radius: model.config.radiusM)
                    .foregroundStyle(Color.brandPrimary.opacity(0.06))
                    .stroke(Color.brandPrimary.opacity(0.35), lineWidth: 1)
            }
            ForEach(model.listings) { listing in
                Annotation(listing.title, coordinate: listing.coordinate, anchor: .bottom) {
                    ListingPin(listing: listing, selected: listing.id == model.selectedId)
                }
                .annotationTitles(.hidden)
                .tag(listing.id)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .mapControls { MapUserLocationButton() }
        .ignoresSafeArea(edges: .bottom)
    }

    @ViewBuilder
    private func panelHeader(_ model: MarketViewModel) -> some View {
        HStack(spacing: Spacing.s) {
            if let listing = model.selectedListing {
                Text(listing.title).font(.lareaHeadline).lineLimit(1)
            } else {
                Circle().fill(model.locating ? Color.secondary : Color.success).frame(width: 8, height: 8)
                Text(model.locating ? "Finding your location…" : (model.listings.isEmpty ? "Nothing nearby yet" : "\(model.listings.count) within 2 km"))
                    .font(.subheadline.weight(.semibold))
            }
            Spacer()
            if model.loading { ProgressView().controlSize(.small) }
        }
        .padding(.horizontal, Spacing.l)
    }

    @ViewBuilder
    private func selectedCard(_ listing: Listing, model: MarketViewModel) -> some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            HStack(alignment: .top) {
                ListingCard(listing: listing, layout: .row)
                Button { model.selectedId = nil } label: {
                    Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.secondary).frame(width: 30, height: 30).background(Color(.tertiarySystemFill), in: Circle())
                }
                .accessibilityLabel("Close")
            }
            if !listing.description.isEmpty {
                Text(listing.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
            PrimaryButton(title: listing.mine ? "Manage listing" : "View listing", identifier: "market.listing.open") {
                router.marketPath.append(.listing(listing.id))
            }
            Spacer(minLength: 0)
        }
        .padding(20)
    }

    @ViewBuilder
    private func listingList(_ model: MarketViewModel) -> some View {
        List {
            Section {
                if model.locating || (model.loading && model.listings.isEmpty) {
                    ForEach(0..<3, id: \.self) { _ in
                        Text("Loading listings").redacted(reason: .placeholder)
                    }
                } else if model.listings.isEmpty, let error = model.error {
                    ContentUnavailableView {
                        Label("Can't load listings", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { Task { await model.refresh() } }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                    }
                } else if model.listings.isEmpty, model.filters.isActive || !model.filters.query.isEmpty {
                    ContentUnavailableView {
                        Label("No matches", systemImage: "line.3.horizontal.decrease.circle")
                    } description: {
                        Text("Nothing within 2 km matches these filters.")
                    } actions: {
                        Button("Clear filters") { model.setFilters(MarketFilters()) }.buttonStyle(.bordered)
                    }
                } else if model.listings.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing nearby yet", systemImage: "storefront")
                    } description: {
                        Text("Be the first: sell something or ask neighbours for help.")
                    } actions: {
                        Button("Post the first listing") { showCreate = true }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                    }
                } else {
                    ForEach(model.listings) { listing in
                        Button {
                            if model.mode == .map { model.selectedId = listing.id } else { router.marketPath.append(.listing(listing.id)) }
                        } label: {
                            ListingCard(listing: listing, layout: .row)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("market.listing.\(listing.id)")
                    }
                }
            } footer: {
                if !model.listings.isEmpty {
                    Text("Locations are approximate. Meet in a public place for handovers.").font(.caption2)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(model.mode == .map ? .hidden : .visible)
        .refreshable { await model.refresh() }
    }

    private func fitIfNeeded(_ model: MarketViewModel) {
        guard !didFitOnce, !model.listings.isEmpty, let fix = env.location.latestFix else { return }
        didFitOnce = true
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lng), latitudinalMeters: 2600, longitudinalMeters: 2600))
        }
    }
}
