import Foundation
import Observation

/// Everything the user is involved in: offers on their listings, their own offers, their listings.
@MainActor
@Observable
final class DealsViewModel {
    var me = MarketMeResponse()
    var loading = true
    var error: String?
    var notice: String?
    var busy = false

    private let api: APIClient
    private let realtime: RealtimeClient
    private var observer: Task<Void, Never>?
    private var pendingRefresh: Task<Void, Never>?

    init(api: APIClient, realtime: RealtimeClient) {
        self.api = api
        self.realtime = realtime
    }

    /// Offers waiting for the user's answer.
    var attentionCount: Int { me.offersReceived.filter { $0.status == .pending }.count }
    var pendingReceived: [Offer] { me.offersReceived.filter { $0.status == .pending } }
    var acceptedReceived: [Offer] { me.offersReceived.filter { $0.status == .accepted } }

    func start() {
        guard observer == nil else { return }
        Task { await refresh() }
        observer = Task { [weak self] in
            guard let self else { return }
            for await event in realtime.events() {
                if case .marketUpdate = event { self.scheduleRefresh() }
            }
        }
    }

    func stop() {
        observer?.cancel()
        observer = nil
    }

    private func scheduleRefresh() {
        pendingRefresh?.cancel()
        pendingRefresh = Task {
            try? await Task.sleep(for: .milliseconds(400))
            if !Task.isCancelled { await refresh() }
        }
    }

    func refresh() async {
        do {
            me = try await api.send(APIRequest(.GET, "market/me"))
            error = nil
        } catch {
            if (error as? APIError)?.code != "MARKET_DISABLED" { self.error = error.userMessage }
        }
        loading = false
    }

    private func run(_ work: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await work()
            await refresh()
        } catch {
            notice = error.userMessage
        }
    }

    func accept(_ offer: Offer) async {
        await run { let _: AcceptOfferResponse = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/accept")) }
    }

    func decline(_ offer: Offer) async {
        await run { let _: Offer = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/decline")) }
    }

    func withdraw(_ offer: Offer) async {
        await run { let _: Offer = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/withdraw")) }
    }
}
