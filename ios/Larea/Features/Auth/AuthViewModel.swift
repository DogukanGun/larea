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

    /// Returns true once the backend accepted the request (the code is on its way if the account exists).
    func sendResetCode(email: String) async -> Bool {
        var sent = false
        await run {
            try await self.sessions.requestPasswordReset(email: email)
            sent = true
        }
        return sent
    }

    func resetPassword(email: String, code: String, password: String) async {
        await run { _ = try await self.sessions.resetPassword(email: email, code: code, password: password) }
    }

    private func run(_ block: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        error = nil
        do { try await block() } catch { self.error = error.userMessage }
        busy = false
    }
}
