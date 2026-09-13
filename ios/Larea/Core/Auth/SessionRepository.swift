import Foundation
import UIKit

/// Sign-in, sign-up, profile and sign-out on top of the API client and the session store.
@MainActor
final class SessionRepository {
    private let api: APIClient
    private let store: SessionStore
    private let deviceLabel = UIDevice.current.name

    init(api: APIClient, store: SessionStore) {
        self.api = api
        self.store = store
    }

    func register(email: String, password: String, displayName: String) async throws -> MeView {
        let body = RegisterRequest(email: email.trimmingCharacters(in: .whitespaces), password: password, displayName: displayName.trimmingCharacters(in: .whitespaces), deviceLabel: deviceLabel)
        let result: AuthResult = try await api.send(try APIRequest(.POST, "auth/register", json: body, authenticated: false))
        store.save(Session(accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user))
        return result.user
    }

    func login(email: String, password: String) async throws -> MeView {
        let body = LoginRequest(email: email.trimmingCharacters(in: .whitespaces), password: password, deviceLabel: deviceLabel)
        let result: AuthResult = try await api.send(try APIRequest(.POST, "auth/login", json: body, authenticated: false))
        store.save(Session(accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user))
        return result.user
    }

    @discardableResult
    func refreshMe() async -> MeView? {
        guard let me: MeView = try? await api.send(APIRequest(.GET, "me")) else { return nil }
        store.updateUser(me)
        return me
    }

    func updateDisplayName(_ name: String) async throws -> MeView {
        let me: MeView = try await api.send(try APIRequest(.PATCH, "me", json: UpdateMeRequest(displayName: name.trimmingCharacters(in: .whitespaces))))
        store.updateUser(me)
        return me
    }

    func signOut() async {
        let refresh = store.session?.refreshToken
        store.clear()
        if let refresh { try? await api.sendNoContent(try APIRequest(.POST, "auth/logout", json: RefreshRequest(refreshToken: refresh), authenticated: false)) }
    }

    func deleteAccount() async throws {
        try await api.sendNoContent(APIRequest(.DELETE, "me"))
        store.clear()
    }
}
