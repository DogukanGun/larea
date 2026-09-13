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
            case .ready: MainFlowView().transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: state)
        .tint(.brandPrimary)
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

struct MainFlowView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            NearbyView(sheetAllowed: path.isEmpty, onJoined: { venueId, venueName in path.append(ChatRoute(venueId: venueId, venueName: venueName)) })
                .navigationDestination(for: ChatRoute.self) { route in
                    ChatView(venueId: route.venueId, venueName: route.venueName, onLeft: { path.removeLast() })
                }
                .navigationDestination(for: String.self) { route in
                    if route == "settings" { SettingsView() }
                }
        }
    }
}
