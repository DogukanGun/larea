import Foundation
import Observation

@MainActor
@Observable
final class StripeViewModel {
    var status = StripeAccountStatus()
    var loaded = false
    var busy = false
    var error: String?

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func refresh(force: Bool = false) async {
        do {
            status = try await api.send(APIRequest(.GET, "market/stripe/account", query: force ? [URLQueryItem(name: "refresh", value: "1")] : []))
            error = nil
        } catch {
            self.error = error.userMessage
        }
        loaded = true
    }

    /// A fresh onboarding link from Stripe; nil (with `error` set) when it failed.
    func startOnboarding() async -> URL? {
        busy = true
        defer { busy = false }
        do {
            let link: StripeAccountLink = try await api.send(APIRequest(.POST, "market/stripe/account-link"))
            return URL(string: link.url)
        } catch {
            self.error = error.userMessage
            return nil
        }
    }
}
