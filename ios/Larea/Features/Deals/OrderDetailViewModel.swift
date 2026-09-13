import Foundation
import Observation

@MainActor
@Observable
final class OrderDetailViewModel {
    let orderId: String
    var order: Order?
    var loading = true
    var busy = false
    var error: String?
    var notice: String?
    var banner: (kind: BannerKind, text: String)?
    var safari: SafariItem?

    private let api: APIClient
    private var pollTask: Task<Void, Never>?

    init(orderId: String, api: APIClient) {
        self.orderId = orderId
        self.api = api
    }

    func load() async {
        do {
            order = try await api.send(APIRequest(.GET, "market/orders/\(orderId)"))
            error = nil
        } catch {
            self.error = error.userMessage
        }
        loading = false
    }

    private func run(_ work: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await work()
            await load()
        } catch {
            notice = error.userMessage
        }
    }

    /// Opens (or resumes) the Stripe Checkout page in the in-app browser.
    func pay() async {
        if let open = order?.checkout, let url = URL(string: open.url) {
            safari = SafariItem(url: url)
            return
        }
        await run {
            let session: CheckoutSession = try await api.send(APIRequest(.POST, "market/orders/\(orderId)/checkout"))
            if let url = URL(string: session.url) { safari = SafariItem(url: url) }
        }
    }

    func approve(code: String) async -> Bool {
        var ok = false
        await run {
            let _: Order = try await api.send(try APIRequest(.POST, "market/orders/\(orderId)/approve", json: ApproveOrderRequest(code: code)))
            ok = true
            banner = (.info, "Handover confirmed. The payout is on its way.")
        }
        return ok
    }

    func cancel() async {
        await run { let _: Order = try await api.send(APIRequest(.POST, "market/orders/\(orderId)/cancel")) }
    }

    /// The webhook can land after the browser comes back; ask a few times.
    func checkoutReturned(success: Bool) {
        safari = nil
        if !success {
            banner = (.warning, "Payment cancelled. You can pay later from here.")
            return
        }
        banner = (.info, "Payment received. Confirming…")
        pollTask?.cancel()
        pollTask = Task {
            for _ in 0..<15 {
                await load()
                if order?.status != .awaitingPayment { break }
                try? await Task.sleep(for: .seconds(2))
                if Task.isCancelled { return }
            }
            if order?.status == .paid {
                banner = (.info, "Paid. Show your handover code when you meet.")
            } else if order?.status == .awaitingPayment {
                banner = (.warning, "We haven't seen the payment yet. Pull to refresh in a moment.")
            }
        }
    }
}
