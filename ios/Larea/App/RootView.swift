import SwiftUI

/// Where the user is in the onboarding funnel; drives which screen is shown.
enum AppState: Equatable {
    case signedOut
    case needsVerification
    case needsLocation(LocationPermission)
    case suspended
    case ready
}

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.scenePhase) private var scenePhase
    @State private var router = AppRouter()

    private var state: AppState {
        guard let me = env.session.session?.user else { return .signedOut }
        if me.suspendedAt != nil { return .suspended }
        if !me.ageVerified { return .needsVerification }
        if env.location.permission != .precise { return .needsLocation(env.location.permission) }
        return .ready
    }

    var body: some View {
        Group {
            switch state {
            case .signedOut: AuthFlowView().transition(.opacity)
            case .needsVerification: VerificationView().transition(.opacity)
            case .needsLocation: LocationPermissionView().transition(.opacity)
            case .suspended: SuspendedView().transition(.opacity)
            case .ready: MainFlowView(router: router).transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: state)
        .tint(.brandPrimary)
        .onOpenURL { url in router.handle(url, ready: state == .ready) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                env.location.refreshPermission()
                Task { await env.sessions.refreshMe() }
            }
        }
        .task { await env.sessions.refreshMe() }
    }
}

struct ChatRoute: Hashable {
    let venueId: String
    let venueName: String
}

/// Four tabs, each with its own navigation stack. The realtime connection lives as long as
/// this view so the Deals badge and members lists stay live outside the chat.
struct MainFlowView: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var router: AppRouter
    @State private var deals: DealsViewModel?

    var body: some View {
        TabView(selection: $router.tab) {
            Tab("Nearby", systemImage: "map.fill", value: AppTab.nearby) { NearbyTab() }
            Tab("Market", systemImage: "storefront.fill", value: AppTab.market) { MarketTab() }
            Tab("Deals", systemImage: "tag.fill", value: AppTab.deals) {
                if let deals { DealsTab(model: deals) } else { ProgressView() }
            }
            .badge(deals?.attentionCount ?? 0)
            Tab("Profile", systemImage: "person.crop.circle.fill", value: AppTab.profile) { ProfileTab() }
        }
        .environment(router)
        .task {
            env.realtime.connect()
            router.drainPending()
            if deals == nil {
                let model = DealsViewModel(api: env.api, realtime: env.realtime)
                deals = model
                if env.session.session?.user.capabilities.market == true { model.start() }
            }
        }
        .onDisappear {
            deals?.stop()
            env.realtime.disconnect()
            router.reset()
        }
    }
}

private struct NearbyTab: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.nearbyPath) {
            NearbyView(onJoined: { venueId, venueName in
                let route = ChatRoute(venueId: venueId, venueName: venueName)
                let model = ChatViewModel(venueId: venueId, api: env.api, realtime: env.realtime, location: env.location, session: env.session)
                router.openChat(model, route: route)
            })
            .navigationDestination(for: NearbyRoute.self) { route in
                switch route {
                case let .chat(chat):
                    if let model = router.activeChat {
                        ChatView(model: model, venueName: chat.venueName, onLeft: { router.endChat() })
                    } else {
                        ProgressView().onAppear { router.endChat() }
                    }
                }
            }
        }
    }
}

private struct MarketTab: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.marketPath) {
            MarketView()
                .navigationDestination(for: MarketRoute.self) { route in
                    switch route {
                    case let .listing(id): ListingDetailView(listingId: id)
                    }
                }
        }
    }
}

private struct DealsTab: View {
    @Environment(AppRouter.self) private var router
    let model: DealsViewModel

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.dealsPath) {
            DealsView(model: model)
                .navigationDestination(for: DealsRoute.self) { route in
                    switch route {
                    case let .listing(id): ListingDetailView(listingId: id)
                    case let .order(id): OrderDetailView(orderId: id)
                    }
                }
        }
    }
}

private struct ProfileTab: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        NavigationStack(path: $router.profilePath) {
            ProfileView()
                .navigationDestination(for: ProfileRoute.self) { route in
                    switch route {
                    case .payouts: StripeOnboardingView()
                    case .myListings: MyListingsView()
                    case let .listing(id): ListingDetailView(listingId: id)
                    }
                }
        }
    }
}
