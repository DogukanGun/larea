import SwiftUI

struct SuspendedView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ScreenScaffold(
            title: "Account suspended",
            subtitle: "Your account was suspended after repeated guideline violations. A moderator will review it.",
            hero: { HeroGlyph(symbol: "hand.raised.fill") }
        ) {
            SecondaryButton(title: "Sign out") { Task { await env.sessions.signOut() } }
        }
    }
}
