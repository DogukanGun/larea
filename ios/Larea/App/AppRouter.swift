import Foundation
import Observation

enum AppTab: String, Hashable, CaseIterable {
    case nearby, market, deals, profile
}

enum NearbyRoute: Hashable {
    case chat(ChatRoute)
}

enum MarketRoute: Hashable {
    case listing(String)
}

enum DealsRoute: Hashable {
    case order(String)
    case listing(String)
}

enum ProfileRoute: Hashable {
    case payouts
    case myListings
    case listing(String)
}

/// Links the backend redirects into: `larea://market/order/<id>?checkout=success|cancel`
/// and `larea://market/stripe/return`.
enum DeepLink: Equatable {
    case orderCheckout(orderId: String, success: Bool)
    case stripeReturn

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme?.lowercased() == "larea", let host = url.host?.lowercased(), host == "market" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        if parts == ["stripe", "return"] { return .stripeReturn }
        if parts.count == 2, parts[0] == "order", !parts[1].isEmpty {
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let checkout = query.first { $0.name == "checkout" }?.value ?? "success"
            return .orderCheckout(orderId: parts[1], success: checkout == "success")
        }
        return nil
    }
}

struct CheckoutResult: Equatable {
    let orderId: String
    let success: Bool
    let nonce: UUID
}

/// Tab selection, per-tab navigation paths, the live chat session and deep-link routing.
@MainActor
@Observable
final class AppRouter {
    var tab: AppTab = .nearby
    var nearbyPath: [NearbyRoute] = []
    var marketPath: [MarketRoute] = []
    var dealsPath: [DealsRoute] = []
    var profilePath: [ProfileRoute] = []
    /// The chat the user is in; survives tab switches so the heartbeat keeps running.
    private(set) var activeChat: ChatViewModel?
    private(set) var activeChatRoute: ChatRoute?
    var checkoutResult: CheckoutResult?
    var stripeReturnCount = 0
    private var pendingLink: DeepLink?

    var isShowingChat: Bool { tab == .nearby && !nearbyPath.isEmpty }

    func openChat(_ model: ChatViewModel, route: ChatRoute) {
        activeChat?.stop()
        activeChat = model
        activeChatRoute = route
        model.start()
        tab = .nearby
        nearbyPath = [.chat(route)]
    }

    /// Brings a live chat back on screen after the user switched tabs.
    func showActiveChat() {
        guard let route = activeChatRoute else { return }
        tab = .nearby
        nearbyPath = [.chat(route)]
    }

    func endChat() {
        activeChat?.stop()
        activeChat = nil
        activeChatRoute = nil
        nearbyPath = []
    }

    /// Applies a link now, or keeps it until the main flow is on screen.
    func handle(_ url: URL, ready: Bool = true) {
        guard let link = DeepLink.parse(url) else { return }
        if ready { apply(link) } else { pendingLink = link }
    }

    func drainPending() {
        guard let link = pendingLink else { return }
        pendingLink = nil
        apply(link)
    }

    /// Sign-out or suspension: drop everything.
    func reset() {
        endChat()
        marketPath = []
        dealsPath = []
        profilePath = []
        tab = .nearby
    }

    private func apply(_ link: DeepLink) {
        switch link {
        case let .orderCheckout(orderId, success):
            tab = .deals
            dealsPath = [.order(orderId)]
            checkoutResult = CheckoutResult(orderId: orderId, success: success, nonce: UUID())
        case .stripeReturn:
            tab = .profile
            profilePath = [.payouts]
            stripeReturnCount += 1
        }
    }
}
