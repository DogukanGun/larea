import SwiftUI

struct LocationPermissionView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ScreenScaffold(
            title: "Where are you?",
            subtitle: "Your location is used to determine which nearby chats you can join. Your exact location is not shown to other users.",
            hero: { HeroGlyph(symbol: "location.fill") }
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                NoteCard(symbol: "eye.slash.fill", text: "Nobody in a chat can see where you are. We only check that you're within 200 m of the place.")
                switch env.location.permission {
                case .coarseOnly:
                    InlineError(text: "Larea needs precise location to confirm you're at a place.")
                    PrimaryButton(title: "Use precise location") { Task { await env.location.requestPreciseIfNeeded() } }
                case .denied:
                    InlineError(text: "Location access is off for Larea. Turn it on in Settings to see nearby chats.")
                    PrimaryButton(title: "Open Settings") { openSettings() }
                default:
                    PrimaryButton(title: "Allow location", identifier: "location.allow") { env.location.requestWhenInUse() }
                }
                if env.location.permission != .denied {
                    LinkButton(title: "Open Settings") { openSettings() }
                }
            }
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
}
