import SwiftUI

enum AuthRoute: Hashable {
    case signIn, signUp
}

struct AuthFlowView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            WelcomeView(onCreateAccount: { path.append(AuthRoute.signUp) }, onSignIn: { path.append(AuthRoute.signIn) })
                .navigationDestination(for: AuthRoute.self) { route in
                    switch route {
                    case .signIn: SignInView(onCreateAccount: { path.append(AuthRoute.signUp) })
                    case .signUp: SignUpView(onSignIn: { path.append(AuthRoute.signIn) })
                    }
                }
        }
    }
}

struct WelcomeView: View {
    let onCreateAccount: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            ZStack {
                Circle().fill(Color.brandTint).frame(width: 220, height: 220).offset(x: -40, y: -10)
                Circle().fill(Color.sunny.opacity(0.35)).frame(width: 90, height: 90).offset(x: 110, y: 60)
                LogoMark(size: 120)
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, Spacing.xxl)

            Text("Larea").font(.system(size: 44, weight: .heavy, design: .rounded))
            Text("Talk to the people around you.")
                .font(.lareaTitle2)
                .padding(.top, Spacing.s)
            Text("Every chat belongs to a real place, and everyone in it is standing there right now.")
                .font(.body)
                .foregroundStyle(.secondary)
                .padding(.top, Spacing.s)
            Spacer()
            VStack(spacing: Spacing.m) {
                PrimaryButton(title: "Create account", identifier: "welcome.create", action: onCreateAccount)
                SecondaryButton(title: "Sign in", identifier: "welcome.signin", action: onSignIn)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, Spacing.xl)
        .background(Color(.systemBackground))
        .toolbar(.hidden, for: .navigationBar)
    }
}
