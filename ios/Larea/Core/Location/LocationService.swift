import CoreLocation
import Foundation
import Observation

struct Fix: Sendable, Equatable {
    let lat: Double
    let lng: Double
    let accuracyM: Double
    let mocked: Bool
    let time: Date
}

enum LocationPermission: Sendable, Equatable {
    case notDetermined, denied, coarseOnly, precise
}

/// Wraps CLLocationManager. Fixes are only used for the backend's eligibility check.
@MainActor
@Observable
final class LocationService: NSObject, CLLocationManagerDelegate {
    private(set) var permission: LocationPermission = .notDetermined
    private(set) var latestFix: Fix?

    private let manager = CLLocationManager()
    private var running = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        refreshPermission()
    }

    func refreshPermission() {
        permission = Self.permission(status: manager.authorizationStatus, accuracy: manager.accuracyAuthorization)
    }

    func requestWhenInUse() {
        manager.requestWhenInUseAuthorization()
    }

    /// Asks once for precise location when the user granted only approximate location.
    func requestPreciseIfNeeded() async {
        guard manager.accuracyAuthorization == .reducedAccuracy else { return }
        _ = try? await manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "PreciseLocation")
        refreshPermission()
    }

    func start() {
        guard !running, permission == .precise else { return }
        running = true
        manager.startUpdatingLocation()
    }

    func stop() {
        running = false
        manager.stopUpdatingLocation()
    }

    /// A fresh fix within the timeout, or nil.
    func awaitFix(timeout: Duration = .seconds(15)) async -> Fix? {
        start()
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if let fix = latestFix, Date().timeIntervalSince(fix.time) < 30 { return fix }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return latestFix
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        let accuracy = manager.accuracyAuthorization
        Task { @MainActor in
            self.permission = Self.permission(status: status, accuracy: accuracy)
            if self.running, self.permission == .precise { self.manager.startUpdatingLocation() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        let fix = Fix(
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude,
            accuracyM: location.horizontalAccuracy,
            mocked: location.sourceInformation?.isSimulatedBySoftware ?? false,
            time: location.timestamp
        )
        Task { @MainActor in self.latestFix = fix }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    private static func permission(status: CLAuthorizationStatus, accuracy: CLAccuracyAuthorization) -> LocationPermission {
        switch status {
        case .notDetermined: return .notDetermined
        case .denied, .restricted: return .denied
        case .authorizedAlways, .authorizedWhenInUse: return accuracy == .fullAccuracy ? .precise : .coarseOnly
        @unknown default: return .denied
        }
    }
}
