import MapKit
import SwiftUI

/// Home screen: a map of real places around the user with a bottom panel to pick and join.
struct NearbyView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    @State private var model: NearbyViewModel?
    @State private var camera: MapCameraPosition = .userLocation(fallback: .automatic)
    /// MapKit's own selection; kept separate so the card survives MapKit clearing it.
    @State private var mapSelection: String?
    @State private var detent: PanelDetent = .medium
    @State private var didFitOnce = false
    @State private var joinCount = 0
    let onJoined: (String, String) -> Void

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            if model == nil { model = NearbyViewModel(api: env.api, location: env.location) }
            model?.start()
        }
        .onDisappear { model?.stop() }
        .sensoryFeedback(.success, trigger: joinCount)
    }

    @ViewBuilder
    private func content(_ model: NearbyViewModel) -> some View {
        ZStack(alignment: .bottom) {
            map(model)
            BottomPanel(detent: $detent) {
                panelHeader(model)
            } content: {
                NearbySheet(model: model, onJoin: { venue in
                    Task {
                        if await model.join(venue) {
                            joinCount += 1
                            onJoined(venue.id, venue.name)
                        }
                    }
                })
            }
        }
        .alert("Not quite there", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
    }

    @ViewBuilder
    private func panelHeader(_ model: NearbyViewModel) -> some View {
        VStack(spacing: Spacing.s) {
            HStack(spacing: Spacing.s) {
                if let venue = model.selectedVenue {
                    Text(venue.name).font(.lareaHeadline).lineLimit(1)
                } else {
                    Circle().fill(model.locating ? Color.secondary : Color.success).frame(width: 8, height: 8)
                    Text(model.locating ? "Finding your location…" : (model.discovering ? "Discovering places…" : (model.viewingElsewhere ? "Places on the map" : "Around you right now")))
                        .font(.subheadline.weight(.semibold))
                }
                Spacer()
                if model.loading || model.discovering { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, Spacing.l)
            if let route = router.activeChatRoute {
                Button { router.showActiveChat() } label: {
                    Pill(text: "Back to \(route.venueName)", style: .sunny, symbol: "bubble.left.fill")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("nearby.activeChip")
            } else if let membership = env.session.session?.user.activeMembership, model.joining == nil {
                Button {
                    Task {
                        if await model.rejoin(venueId: membership.venueId) {
                            joinCount += 1
                            onJoined(membership.venueId, membership.venueName)
                        }
                    }
                } label: {
                    Pill(text: "Rejoin \(membership.venueName)", style: .sunny, symbol: "arrow.uturn.backward")
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("nearby.rejoin")
            }
        }
    }

    @ViewBuilder
    private func map(_ model: NearbyViewModel) -> some View {
        Map(position: $camera, selection: $mapSelection) {
            UserAnnotation()
            ForEach(model.venues) { venue in
                Annotation(venue.name, coordinate: venue.coordinate, anchor: .center) {
                    VenuePin(venue: venue, selected: venue.id == model.selectedId)
                }
                .annotationTitles(.hidden)
                .tag(venue.id)
            }
            if let venue = model.selectedVenue {
                MapCircle(center: venue.coordinate, radius: 200)
                    .foregroundStyle(Color.brandPrimary.opacity(0.12))
                    .stroke(Color.brandPrimary.opacity(0.6), lineWidth: 1.5)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .mapControls {
            MapUserLocationButton()
            MapCompass()
        }
        .ignoresSafeArea(edges: .bottom)
        .overlay(alignment: .top) { topBar }
        .onChange(of: model.venues.map(\.id)) { _, _ in fitIfNeeded(model) }
        .onMapCameraChange(frequency: .onEnd) { context in
            // Places are fetched for wherever the map is looking, so the whole city is browsable.
            let region = context.region
            let latMeters = region.span.latitudeDelta * 111_320
            let lngMeters = region.span.longitudeDelta * 111_320 * cos(region.center.latitude * .pi / 180)
            model.mapMoved(centerLat: region.center.latitude, centerLng: region.center.longitude, radiusM: max(latMeters, lngMeters) / 2)
        }
        .onChange(of: mapSelection) { _, id in
            // A pin tap selects; MapKit clearing the selection (map tap, re-layout) keeps the card.
            if let id, id != model.selectedId { model.selectedId = id }
        }
        .onChange(of: model.selectedId) { _, id in
            if mapSelection != id { mapSelection = id }
            guard let venue = model.venues.first(where: { $0.id == id }) else { return }
            withAnimation(.easeInOut(duration: 0.4)) {
                camera = .region(MKCoordinateRegion(center: venue.coordinate, latitudinalMeters: 700, longitudinalMeters: 700))
            }
            detent = .medium
        }
    }

    private var topBar: some View {
        HStack {
            HStack(spacing: 8) {
                LogoMark(size: 26)
                Text("Larea").font(.system(size: 22, weight: .heavy, design: .rounded))
                    .accessibilityIdentifier("nearby.root") // identifiers go on leaves: containers would override their children
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.bar, in: Capsule())
            Spacer()
        }
        .padding(.horizontal, Spacing.screen)
        .padding(.top, 8)
    }

    private func fitIfNeeded(_ model: NearbyViewModel) {
        guard !didFitOnce, !model.venues.isEmpty, let fix = env.location.latestFix else { return }
        didFitOnce = true
        let nearest = model.venues.prefix(8)
        let span = max(500, Double(nearest.map(\.distanceM).max() ?? 500) * 2.4)
        withAnimation(.easeInOut(duration: 0.6)) {
            camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lng), latitudinalMeters: span, longitudinalMeters: span))
        }
    }
}

private struct VenuePin: View {
    let venue: NearbyVenue
    let selected: Bool

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: venue.category.symbol)
                .font(.system(size: selected ? 18 : 15, weight: .bold))
                .foregroundStyle(venue.eligible || selected ? Color.white : Color.brandPrimary)
                .frame(width: selected ? 44 : 34, height: selected ? 44 : 34)
                .background(venue.eligible || selected ? Color.brandPrimary : Color(.systemBackground), in: Circle())
                .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
                .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
            if selected {
                Text(venue.name)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.bar, in: Capsule())
            }
        }
        .animation(.spring(duration: 0.25), value: selected)
        .accessibilityLabel("\(venue.name), \(venue.category.label)\(venue.eligible ? ", nearby" : "")")
    }
}

private struct NearbySheet: View {
    @Bindable var model: NearbyViewModel
    let onJoin: (NearbyVenue) -> Void

    var body: some View {
        if let venue = model.selectedVenue {
            VenueCard(venue: venue, joining: model.joining == venue.id, onJoin: { onJoin(venue) }, onClose: { model.selectedId = nil })
        } else {
            VenueList(model: model)
        }
    }
}

private struct VenueList: View {
    @Bindable var model: NearbyViewModel

    var body: some View {
        List {
            Section {
                if model.locating || (model.loading && model.venues.isEmpty) {
                    ForEach(0..<3, id: \.self) { _ in
                        VenueRow(venue: NearbyVenue(id: "-", slug: "", name: "Placeholder place", label: "General Chat", category: .library, address: "Some street 1", lat: 0, lng: 0, distanceM: 120, eligible: false, memberCount: 0))
                            .redacted(reason: .placeholder)
                    }
                } else if model.venues.isEmpty, let error = model.error {
                    ContentUnavailableView {
                        Label("Can't load places", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { Task { await model.refresh() } }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                    }
                } else if model.venues.isEmpty, model.discovering {
                    HStack(spacing: Spacing.m) {
                        ProgressView()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.viewingElsewhere ? "Looking for places in this area…" : "Looking for places around you…").font(.lareaHeadline)
                            Text("First look at this area: fetching libraries, stations, squares and more.").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, Spacing.s)
                } else if model.venues.isEmpty {
                    ContentUnavailableView(
                        "No places around here",
                        systemImage: "mappin.slash",
                        description: Text(emptyDescription)
                    )
                } else {
                    ForEach(model.venues) { venue in
                        Button { model.selectedId = venue.id } label: { VenueRow(venue: venue) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("venue.\(venue.id)")
                            .accessibilityHint(venue.eligible ? "Nearby, you can join" : "Get closer to join")
                    }
                }
            } footer: {
                Text(model.zoomedOut ? "Zoom in to see cafés. \(model.attribution)" : model.attribution).font(.caption2)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await model.refresh() }
    }

    private var emptyDescription: String {
        if model.degraded { return "The place service is busy right now. Pull to try again." }
        if model.zoomedOut { return "Zoom in or move the map to find libraries, stations, squares and parks." }
        return "Chats live at libraries, stations, squares, parks and other public places. Move the map or pull to refresh."
    }
}

private struct VenueRow: View {
    let venue: NearbyVenue

    var body: some View {
        HStack(spacing: Spacing.m) {
            VenueIcon(category: venue.category, dimmed: !venue.eligible)
            VStack(alignment: .leading, spacing: 3) {
                Text(venue.name).font(.lareaHeadline).foregroundStyle(.primary).lineLimit(1)
                Text([venue.category.label, venue.address].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                Text("\(venue.memberCount) here · \(venue.distanceText)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Spacing.s)
            if venue.eligible {
                Pill(text: "Nearby", style: .sunny, symbol: "location.fill")
            } else {
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
        .opacity(venue.eligible ? 1 : 0.75)
        .contentShape(Rectangle())
    }
}

private struct VenueCard: View {
    let venue: NearbyVenue
    let joining: Bool
    let onJoin: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            HStack(alignment: .top, spacing: Spacing.m) {
                VenueIcon(category: venue.category, size: 52, dimmed: !venue.eligible)
                VStack(alignment: .leading, spacing: 4) {
                    Text(venue.name).font(.lareaTitle3).lineLimit(2)
                    Text([venue.category.label, venue.address].compactMap { $0 }.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.secondary).frame(width: 30, height: 30).background(Color(.tertiarySystemFill), in: Circle())
                }
                .accessibilityLabel("Close")
            }
            HStack(spacing: Spacing.m) {
                Label(venue.memberCount == 1 ? "1 person here" : "\(venue.memberCount) people here", systemImage: "person.2.fill")
                Label("\(venue.distanceText) away", systemImage: "location.fill")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            if venue.eligible {
                PrimaryButton(title: "Join chat", isLoading: joining, identifier: "venue.card.join", action: onJoin)
            } else {
                NoteCard(symbol: "figure.walk", text: "Get within 200 m of this place to join its chat. You're about \(venue.distanceText) away.")
                SecondaryButton(title: "Try to join anyway", identifier: "venue.card.join", action: onJoin)
            }
            Spacer(minLength: 0)
        }
        .padding(Spacing.screen)
    }
}
