import DeclaredAgeRange
import SwiftUI

struct VerificationView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.requestAgeRange) private var requestAgeRange
    @State private var model: VerificationViewModel?

    var body: some View {
        ScreenScaffold(
            title: "Confirm you're 18 or older",
            subtitle: "Chats connect you with people standing next to you, so Larea is for adults only. Your iPhone confirms your age range in one step.",
            hero: { HeroGlyph(symbol: "person.badge.shield.checkmark.fill") }
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                StepRow(number: 1, title: "Tap Confirm my age", detail: "iOS asks whether you want to share your age range with Larea.")
                StepRow(number: 2, title: "Allow sharing", detail: "Only the range (for example 18+) is shared, never your birthday or ID.")
                StepRow(number: 3, title: "You're in", detail: "Nearby chats unlock immediately.")
                NoteCard(symbol: "lock.shield.fill", text: "Larea stores only that you passed. Your Apple Account keeps your age; Larea never sees a document.")

                switch model?.outcome {
                case .declined: InlineError(text: "You need to share that you're 18 or older to use Larea.")
                case .underAge: InlineError(text: "Larea is for adults only.")
                case .unknownAge: InlineError(text: "Your Apple Account has no age on file. Add your birthday in Settings › Apple Account, then try again.")
                case .unavailable: InlineError(text: "Age confirmation isn't available on this device yet. Update iOS or sign in to your Apple Account, then try again.")
                case let .failed(message): InlineError(text: message)
                case nil: EmptyView()
                }

                PrimaryButton(title: "Confirm my age", isLoading: model?.busy ?? false, identifier: "verify.start") { Task { await confirm() } }
            }
        }
        .onAppear {
            if model == nil { model = VerificationViewModel(api: env.api, sessions: env.sessions) }
            Task { await model?.refreshStatus() }
        }
    }

    @MainActor
    private func confirm() async {
        guard let model else { return }
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "LareaTestAgePass") {
            await model.passForTests()
            return
        }
        #endif
        // The action is a non-Sendable value that the framework runs off the main actor;
        // it is used exactly once per tap, so handing it over is safe.
        let handoff = AgeRangeHandoff(action: requestAgeRange)
        do {
            let response = try await handoff.run()
            await model.submit(response)
        } catch {
            model.report(error)
        }
    }
}

private struct AgeRangeHandoff: @unchecked Sendable {
    let action: DeclaredAgeRangeAction

    func run() async throws -> AgeRangeService.Response {
        try await action(ageGates: 18)
    }
}
