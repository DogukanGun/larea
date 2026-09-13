import Foundation
import Observation

@MainActor
@Observable
final class ListingDetailViewModel {
    let listingId: String
    var listing: Listing?
    var config = MarketConfig()
    var loading = true
    var busy = false
    var tooFar = false
    var error: String?
    var notice: String?
    /// The server refused because the payee has no payout account yet.
    var needsPayouts = false
    /// A deal was just opened by accepting an offer.
    var openedOrderId: String?

    private let api: APIClient
    private let location: LocationService

    init(listingId: String, api: APIClient, location: LocationService) {
        self.listingId = listingId
        self.api = api
        self.location = location
    }

    func load() async {
        var query: [URLQueryItem] = []
        if let fix = location.latestFix {
            query = [URLQueryItem(name: "lat", value: String(fix.lat)), URLQueryItem(name: "lng", value: String(fix.lng)), URLQueryItem(name: "accuracy", value: String(fix.accuracyM))]
        }
        do {
            listing = try await api.send(APIRequest(.GET, "market/listings/\(listingId)", query: query))
            tooFar = false
            error = nil
            if listing?.mine == true, let fetched: MarketConfig = try? await api.send(APIRequest(.GET, "market/config")) { config = fetched }
        } catch {
            if (error as? APIError)?.code == "TOO_FAR" { tooFar = true } else { self.error = error.userMessage }
        }
        loading = false
    }

    private func run(_ work: () async throws -> Void, success: String? = nil) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await work()
            if let success { notice = success }
            await load()
        } catch {
            if (error as? APIError)?.code == "PAYOUTS_NOT_READY" { needsPayouts = true } else { notice = error.userMessage }
        }
    }

    func makeOffer(amountCents: Int, note: String?) async {
        guard let fix = location.latestFix else {
            notice = "We need your location to make an offer."
            return
        }
        await run({
            let body = CreateOfferRequest(amountCents: amountCents, note: note?.isEmpty == false ? note : nil, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM, mocked: fix.mocked)
            let _: Offer = try await api.send(try APIRequest(.POST, "market/listings/\(listingId)/offers", json: body))
        }, success: "Offer sent. You'll hear back here.")
    }

    func withdraw(_ offer: Offer) async {
        await run({ let _: Offer = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/withdraw")) })
    }

    func accept(_ offer: Offer) async {
        await run({
            let response: AcceptOfferResponse = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/accept"))
            openedOrderId = response.order?.id
        }, success: nil)
        if openedOrderId == nil, notice == nil, !needsPayouts { notice = "Offer accepted. Arrange the handover with \(offer.offerer.displayName)." }
    }

    func decline(_ offer: Offer) async {
        await run({ let _: Offer = try await api.send(APIRequest(.POST, "market/offers/\(offer.id)/decline")) })
    }

    func markSold() async {
        await run({ let _: Listing = try await api.send(APIRequest(.POST, "market/listings/\(listingId)/sold")) })
    }

    func cancel() async {
        await run({ let _: Listing = try await api.send(APIRequest(.POST, "market/listings/\(listingId)/cancel")) })
    }

    func report(reason: String) async {
        do {
            try await api.sendNoContent(try APIRequest(.POST, "market/listings/\(listingId)/reports", json: CreateReportRequest(reason: reason, details: nil)))
            notice = "Thanks, your report was sent."
        } catch {
            notice = error.userMessage
        }
    }

    func blockOwner() async {
        guard let owner = listing?.owner else { return }
        do {
            try await api.sendNoContent(APIRequest(.POST, "users/\(owner.id)/block"))
            notice = "\(owner.displayName) is blocked."
        } catch {
            notice = error.userMessage
        }
    }
}
