import Foundation
import Observation
import StoreKit

/// App Store purchases for message pins (consumables, one per tier). The pin's id travels as the
/// transaction's appAccountToken; the server verifies the signed transaction and only then do we
/// finish it, so a purchase interrupted by a crash or a dead network is delivered on the next launch.
@MainActor
@Observable
final class PinStore {
    enum Outcome: Equatable {
        case activated(MessagePin)
        case cancelled
        /// Waiting for approval (Ask to Buy) or a delayed payment; it is delivered when it clears.
        case pending
    }

    enum StoreError: LocalizedError {
        case productUnavailable
        case badPinId

        var errorDescription: String? {
            switch self {
            case .productUnavailable: return "This pin can't be bought right now. Please try again later."
            case .badPinId: return "Something went wrong with this pin. Please start again."
            }
        }
    }

    private(set) var products: [String: Product] = [:]
    /// A pin that went live from a purchase finished in the background (shown as a toast on the map).
    var deliveredInBackground: MessagePin?

    private let api: APIClient
    private var updates: Task<Void, Never>?

    init(api: APIClient) {
        self.api = api
    }

    /// Listens for transactions that complete outside a purchase call and retries unfinished ones.
    func start() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.deliverInBackground(result)
            }
        }
        Task {
            for await result in Transaction.unfinished { await deliverInBackground(result) }
            await loadProducts()
        }
    }

    func stop() {
        updates?.cancel()
        updates = nil
    }

    func loadProducts() async {
        guard let loaded = try? await Product.products(for: PinTier.allCases.map(\.productId)) else { return }
        products = Dictionary(uniqueKeysWithValues: loaded.map { ($0.id, $0) })
    }

    /// The store's localized price; falls back to the server's USD price when the store is unreachable.
    func displayPrice(for quote: PinQuote) -> String {
        products[quote.productId]?.displayPrice ?? "$\(quote.priceUsd)"
    }

    func purchase(_ quote: PinQuote) async throws -> Outcome {
        if products[quote.productId] == nil { await loadProducts() }
        guard let product = products[quote.productId] else { throw StoreError.productUnavailable }
        guard let token = UUID(uuidString: quote.pin.id) else { throw StoreError.badPinId }
        switch try await product.purchase(options: [.appAccountToken(token)]) {
        case let .success(result):
            return .activated(try await deliver(result))
        case .userCancelled:
            return .cancelled
        case .pending:
            return .pending
        @unknown default:
            return .cancelled
        }
    }

    /// Hands the signed transaction to the server. The server checks Apple's signature, so we send it
    /// even when local verification fails and let the server decide.
    private func deliver(_ result: VerificationResult<Transaction>) async throws -> MessagePin {
        let transaction = result.unsafePayloadValue
        guard let pinId = transaction.appAccountToken?.uuidString.lowercased() else {
            await transaction.finish()
            throw StoreError.badPinId
        }
        do {
            let pin: MessagePin = try await api.send(try APIRequest(.POST, "pins/\(pinId)/purchase", json: PinPurchaseRequest(signedTransaction: result.jwsRepresentation)))
            await transaction.finish()
            return pin
        } catch let error as APIError {
            // Settled for good on the server: refunded, already used, or the pin is gone. Retrying cannot help.
            if ["PURCHASE_REVOKED", "PURCHASE_USED", "PIN_ALREADY_PAID", "NOT_FOUND"].contains(error.code ?? "") { await transaction.finish() }
            throw error
        }
    }

    private func deliverInBackground(_ result: VerificationResult<Transaction>) async {
        guard PinTier.allCases.map(\.productId).contains(result.unsafePayloadValue.productID) else { return }
        if let pin = try? await deliver(result) { deliveredInBackground = pin }
    }
}
