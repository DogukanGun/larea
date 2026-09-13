import Foundation
import Observation

/// App-wide services, created once and injected through the SwiftUI environment.
@MainActor
@Observable
final class AppEnvironment {
    let session: SessionStore
    let api: APIClient
    let sessions: SessionRepository
    let realtime: RealtimeClient
    let location: LocationService

    init() {
        let store = SessionStore()
        #if DEBUG
        // UI tests launch with "-LareaResetState 1" so a previous run's session never leaks in.
        if UserDefaults.standard.bool(forKey: "LareaResetState") { store.clear() }
        #endif
        let refresher = TokenRefresher(baseURL: Backend.apiBaseURL, store: store)
        let api = APIClient(baseURL: Backend.apiBaseURL, tokens: refresher)
        session = store
        self.api = api
        sessions = SessionRepository(api: api, store: store)
        realtime = RealtimeClient(url: Backend.webSocketURL, tokens: refresher)
        location = LocationService()
    }
}
