import CoreLocation
import Foundation
import Observation

extension Listing {
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng) }
}

/// Listings within reach of the phone's position. The feed is centred on the fix, not on the map.
@MainActor
@Observable
final class MarketViewModel {
    enum Mode: String, CaseIterable { case map, list }

    var listings: [Listing] = []
    var loading = false
    var locating = true
    var error: String?
    var notice: String?
    var filters = MarketFilters()
    var mode: Mode = .map
    var selectedId: String?
    var config = MarketConfig()

    var selectedListing: Listing? { listings.first { $0.id == selectedId } }

    private let api: APIClient
    private let location: LocationService
    private var watch: Task<Void, Never>?
    private var queryDebounce: Task<Void, Never>?
    private var lastRefreshFix: Fix?
    private var lastRefreshAt: Date = .distantPast
    private var filtersDirty = false

    init(api: APIClient, location: LocationService) {
        self.api = api
        self.location = location
    }

    func start() {
        location.start()
        watch?.cancel()
        Task { await loadConfig() }
        watch = Task {
            while !Task.isCancelled {
                if let fix = location.latestFix, shouldRefresh(for: fix) || filtersDirty {
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

    private func shouldRefresh(for fix: Fix) -> Bool {
        guard let last = lastRefreshFix else { return true }
        let moved = CLLocation(latitude: fix.lat, longitude: fix.lng).distance(from: CLLocation(latitude: last.lat, longitude: last.lng))
        return moved > 250 || Date().timeIntervalSince(lastRefreshAt) > 60
    }

    func setFilters(_ next: MarketFilters) {
        guard next != filters else { return }
        let onlyQueryChanged = MarketFilters(kind: next.kind, category: next.category, minCents: next.minCents, maxCents: next.maxCents, sort: next.sort, query: filters.query) == filters
        filters = next
        if onlyQueryChanged {
            queryDebounce?.cancel()
            queryDebounce = Task {
                try? await Task.sleep(for: .milliseconds(300))
                if !Task.isCancelled { filtersDirty = true }
            }
        } else {
            filtersDirty = true
        }
    }

    func refresh() async {
        guard let fix = location.latestFix, !loading else { return }
        loading = true
        error = nil
        let snapshot = filters
        do {
            let query = [
                URLQueryItem(name: "lat", value: String(fix.lat)),
                URLQueryItem(name: "lng", value: String(fix.lng)),
                URLQueryItem(name: "accuracy", value: String(fix.accuracyM)),
            ] + snapshot.queryItems
            let response: ListingsResponse = try await api.send(APIRequest(.GET, "market/listings", query: query))
            listings = response.listings
            if let selectedId, !listings.contains(where: { $0.id == selectedId }) { self.selectedId = nil }
            lastRefreshFix = fix
            lastRefreshAt = Date()
            if snapshot == filters { filtersDirty = false }
        } catch {
            self.error = error.userMessage
        }
        locating = false
        loading = false
    }

    private func loadConfig() async {
        if let fetched: MarketConfig = try? await api.send(APIRequest(.GET, "market/config")) { config = fetched }
    }

    /// A listing just created by the user shows up right away.
    func insert(_ listing: Listing) {
        listings.removeAll { $0.id == listing.id }
        listings.insert(listing, at: 0)
    }

    func remove(_ id: String) {
        listings.removeAll { $0.id == id }
        if selectedId == id { selectedId = nil }
    }
}
