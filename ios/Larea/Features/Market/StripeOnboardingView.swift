import SwiftUI

/// Explains payouts and opens Stripe's Express onboarding in an in-app browser.
struct StripeOnboardingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase
    var onReady: (() -> Void)? = nil
    @State private var model: StripeViewModel?
    @State private var safari: SafariItem?

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationTitle("Payouts")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil {
                let created = StripeViewModel(api: env.api)
                model = created
                Task { await created.refresh() }
            }
        }
        .onChange(of: router.stripeReturnCount) { _, _ in
            safari = nil
            Task { await model?.refresh(force: true) }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await model?.refresh(force: true) } } }
        .onChange(of: model?.status.payoutsEnabled) { _, ready in if ready == true { onReady?() } }
    }

    @ViewBuilder
    private func content(_ model: StripeViewModel) -> some View {
        ScreenScaffold(
            title: "Get paid for what you sell",
            subtitle: "Larea holds the buyer's money and pays you out after the handover. Payouts run through Stripe.",
            hero: { HeroGlyph(symbol: "eurosign.circle.fill") }
        ) {
            VStack(alignment: .leading, spacing: Spacing.l) {
                StepRow(number: 1, title: "Set up payouts with Stripe", detail: "Takes a few minutes: your name, address and the bank account to pay into.")
                StepRow(number: 2, title: "Buyers pay inside Larea", detail: "The money is held safely until you meet.")
                StepRow(number: 3, title: "Enter the buyer's code at the handover", detail: "That releases the payout to your account.")
                HStack(spacing: Spacing.m) {
                    Text("Status").font(.lareaHeadline)
                    Spacer()
                    if model.loaded {
                        Pill(text: model.status.status.label, style: pillStyle(model.status.status), symbol: model.status.status == .ready ? "checkmark.seal.fill" : nil)
                            .accessibilityIdentifier("market.stripe.status")
                    } else {
                        ProgressView().controlSize(.small)
                    }
                }
                .padding(Spacing.m)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                if model.status.status == .pending, !model.status.requirementsDue.isEmpty {
                    NoteCard(symbol: "exclamationmark.circle", text: "Stripe still needs a few details. Continue the setup to finish.")
                }
                if let error = model.error { InlineError(text: error) }
                if model.status.status != .ready {
                    PrimaryButton(title: model.status.status == .notSetUp ? "Set up payouts" : "Continue setup", isLoading: model.busy, identifier: "market.stripe.setup") {
                        Task {
                            if let url = await model.startOnboarding() { safari = SafariItem(url: url) }
                        }
                    }
                } else {
                    NoteCard(symbol: "checkmark.seal.fill", text: "You're all set. Payouts arrive in the bank account you gave Stripe.")
                    SecondaryButton(title: "Update payout details", identifier: "market.stripe.update") {
                        Task {
                            if let url = await model.startOnboarding() { safari = SafariItem(url: url) }
                        }
                    }
                }
            }
        }
        .sheet(item: $safari) { item in
            SafariView(url: item.url, onDone: { safari = nil; Task { await model.refresh(force: true) } }).ignoresSafeArea()
        }
    }

    private func pillStyle(_ status: StripeStatus) -> Pill.Style {
        switch status {
        case .ready: return .success
        case .pending: return .sunny
        case .notSetUp: return .neutral
        }
    }
}
