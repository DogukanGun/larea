import Foundation
import Observation

@MainActor
@Observable
final class ProfileViewModel {
    var blocks: [BlockedUser] = []
    var stripe: StripeAccountStatus?
    var listingCount: Int?
    var busy = false
    var message: String?

    private let api: APIClient
    private let sessions: SessionRepository

    init(api: APIClient, sessions: SessionRepository) {
        self.api = api
        self.sessions = sessions
    }

    func loadMarket() async {
        stripe = try? await api.send(APIRequest(.GET, "market/stripe/account"))
        if let me: MarketMeResponse = try? await api.send(APIRequest(.GET, "market/me")) { listingCount = me.listings.count }
    }

    func loadBlocks() async {
        if let response: BlocksResponse = try? await api.send(APIRequest(.GET, "me/blocks")) { blocks = response.blocks }
    }

    func saveDisplayName(_ name: String) async {
        await run {
            _ = try await self.sessions.updateDisplayName(name)
            return "Saved."
        }
    }

    func unblock(_ user: BlockedUser) async {
        await run {
            try await self.api.sendNoContent(APIRequest(.DELETE, "users/\(user.id)/block"))
            await self.loadBlocks()
            return "Unblocked."
        }
    }

    func signOut() async {
        await run { await self.sessions.signOut(); return nil }
    }

    func deleteAccount() async {
        await run { try await self.sessions.deleteAccount(); return nil }
    }

    private func run(_ block: () async throws -> String?) async {
        guard !busy else { return }
        busy = true
        do { message = try await block() } catch { message = error.userMessage }
        busy = false
    }
}
