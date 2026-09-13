import Foundation
import Observation

@MainActor
@Observable
final class AuthViewModel {
    var busy = false
    var error: String?

    private let sessions: SessionRepository

    init(sessions: SessionRepository) {
        self.sessions = sessions
    }

    func signIn(email: String, password: String) async {
        await run { _ = try await self.sessions.login(email: email, password: password) }
    }

    func signUp(email: String, password: String, displayName: String) async {
        await run { _ = try await self.sessions.register(email: email, password: password, displayName: displayName) }
    }

    private func run(_ block: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        error = nil
        do { try await block() } catch { self.error = error.userMessage }
        busy = false
    }
}
