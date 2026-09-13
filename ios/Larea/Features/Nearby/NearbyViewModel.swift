import CoreLocation
import Foundation
import Observation

extension NearbyVenue {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
}

/// Where the map is looking: its centre plus half the visible width in metres.
struct Viewport: Sendable, Equatable {
    let lat: Double
    let lng: Double
    let radiusM: Double

    /// Wider than this the server only returns landmarks; cafés need a closer look.
    static let cafeRadiusM: Double = 1500
    static let minRadiusM: Double = 300
    static let maxRadiusM: Double = 12_000

    func distance(toLat otherLat: Double, lng otherLng: Double) -> Double {
        CLLocation(latitude: lat, longitude: lng).distance(from: CLLocation(latitude: otherLat, longitude: otherLng))
    }
}

@MainActor
@Observable
final class NearbyViewModel {
    var venues: [NearbyVenue] = []
    var loading = false
    var locating = true
    var joining: String?
    var error: String?
    var notice: String?
    var degraded = false
    /// The server is still discovering places for this area.
    var discovering = false
    var attribution = "Place data © OpenStreetMap contributors"
    var selectedId: String?
    /// Where the map is looking; nil until the map reports its first camera position.
    private(set) var viewport: Viewport?

    var selectedVenue: NearbyVenue? { venues.first { $0.id == selectedId } }

    /// True once the map has been panned away from the user's own surroundings.
    var viewingElsewhere: Bool {
        guard let viewport, let fix = location.latestFix else { return false }
        return viewport.distance(toLat: fix.lat, lng: fix.lng) > max(1000, viewport.radiusM)
    }

    /// Wide view: only landmarks are shown, cafés appear after zooming in.
    var zoomedOut: Bool { (viewport?.radiusM ?? 0) > Viewport.cafeRadiusM }

    private let api: APIClient
    private let location: LocationService
    private var watch: Task<Void, Never>?
    private var lastRefreshFix: Fix?
    private var lastRefreshViewport: Viewport?
    private var lastRefreshAt: Date = .distantPast
    private var pendingPolls = 0

    init(api: APIClient, location: LocationService) {
        self.api = api
        self.location = location
    }

    func start() {
        location.start()
        watch?.cancel()
        watch = Task {
            while !Task.isCancelled {
                if let fix = location.latestFix, shouldRefresh(for: fix) || viewportMoved {
                    pendingPolls = 0
                    await refresh()
                } else if discovering, pendingPolls < 40, Date().timeIntervalSince(lastRefreshAt) >= 3 {
                    // Discovery runs on the server; poll until the area is covered.
                    pendingPolls += 1
                    await refresh()
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    func stop() {
        watch?.cancel()
        watch = nil
    }

    /// The map settled on a new camera position: fetch the places there.
    func mapMoved(centerLat: Double, centerLng: Double, radiusM: Double) {
        viewport = Viewport(lat: centerLat, lng: centerLng, radiusM: min(max(radiusM, Viewport.minRadiusM), Viewport.maxRadiusM))
        guard viewportMoved, !loading else { return }
        pendingPolls = 0
        Task { await refresh() }
    }

    /// The map moved by more than a third of its half-width, or zoomed by more than a third.
    private var viewportMoved: Bool {
        guard let viewport else { return false }
        guard let last = lastRefreshViewport else { return true }
        return viewport.distance(toLat: last.lat, lng: last.lng) > last.radiusM / 3 || abs(viewport.radiusM - last.radiusM) > last.radiusM / 3
    }

    /// Refresh when we move more than 250 m or every 60 s.
    private func shouldRefresh(for fix: Fix) -> Bool {
        guard let last = lastRefreshFix else { return true }
        let moved = CLLocation(latitude: fix.lat, longitude: fix.lng).distance(from: CLLocation(latitude: last.lat, longitude: last.lng))
        return moved > 250 || Date().timeIntervalSince(lastRefreshAt) > 60
    }

    func refresh() async {
        guard let fix = location.latestFix, !loading else { return }
        loading = true
        error = nil
        let view = viewport
        var query = [
            URLQueryItem(name: "lat", value: String(fix.lat)),
            URLQueryItem(name: "lng", value: String(fix.lng)),
            URLQueryItem(name: "accuracy", value: String(fix.accuracyM)),
        ]
        if let view {
            query += [
                URLQueryItem(name: "viewLat", value: String(view.lat)),
                URLQueryItem(name: "viewLng", value: String(view.lng)),
                URLQueryItem(name: "viewRadiusM", value: String(Int(view.radiusM.rounded()))),
            ]
        }
        do {
            let response: NearbyResponse = try await api.send(APIRequest(.GET, "venues/nearby", query: query))
            venues = response.venues
            discovering = response.pending
            degraded = response.degraded
            if let attribution = response.attribution { self.attribution = attribution }
            if let selectedId, !venues.contains(where: { $0.id == selectedId }) { self.selectedId = nil }
            lastRefreshFix = fix
            lastRefreshViewport = view
            lastRefreshAt = Date()
        } catch {
            self.error = error.userMessage
        }
        locating = false
        loading = false
    }

    /// The server decides; a refusal comes back with its own message ("You need to be closer…").
    func join(_ venue: NearbyVenue) async -> Bool {
        await join(venueId: venue.id)
    }

    /// Re-enters a chat the server still lists us in (after a relaunch or a tab switch gone stale).
    func rejoin(venueId: String) async -> Bool {
        await join(venueId: venueId)
    }

    private func join(venueId: String) async -> Bool {
        guard joining == nil, let fix = location.latestFix else { return false }
        joining = venueId
        defer { joining = nil }
        do {
            let body = LocationFixBody(lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM, mocked: fix.mocked)
            let _: JoinResult = try await api.send(try APIRequest(.POST, "venues/\(venueId)/join", json: body))
            return true
        } catch {
            notice = error.userMessage
            return false
        }
    }
}
