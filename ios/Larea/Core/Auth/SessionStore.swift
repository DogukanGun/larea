import Foundation
import Observation

struct Session: Codable, Sendable, Equatable {
    var accessToken: String
    var refreshToken: String
    var user: MeView
}

/// The signed-in session, observable by views and persisted in the Keychain.
@MainActor
@Observable
final class SessionStore {
    private(set) var session: Session?
    private let keychain = Keychain(service: "com.dogukangundogan.larea")
    private let account = "session"

    init() {
        if let data = keychain.read(account: account) {
            session = try? JSONDecoder().decode(Session.self, from: data)
        }
    }

    func save(_ session: Session) {
        self.session = session
        if let data = try? JSONEncoder().encode(session) { keychain.write(data, account: account) }
    }

    func updateAccessToken(_ token: String) {
        guard var s = session else { return }
        s.accessToken = token
        save(s)
    }

    func updateUser(_ user: MeView) {
        guard var s = session else { return }
        s.user = user
        save(s)
    }

    func clear() {
        session = nil
        keychain.delete(account: account)
    }
}
