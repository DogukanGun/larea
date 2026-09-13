import SwiftUI

/// Explainer / form screen: optional hero, rounded title, subtitle, then content.
struct ScreenScaffold<Hero: View, Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder let hero: Hero
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                hero.frame(maxWidth: .infinity).padding(.top, Spacing.xl)
                Text(title).font(.lareaTitle).fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(subtitle).font(.body).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                }
                content
            }
            .padding(.horizontal, 20)
            .padding(.bottom, Spacing.xxl)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemBackground))
    }
}

extension ScreenScaffold where Hero == EmptyView {
    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.hero = EmptyView()
        self.content = content()
    }
}

/// Numbered step row for explainers.
struct StepRow: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Text("\(number)")
                .font(.lareaCaptionBold)
                .foregroundStyle(Color.brandDeep)
                .frame(width: 28, height: 28)
                .background(Color.brandTint, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.lareaHeadline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
}

/// Soft tinted card for privacy notes and hints.
struct NoteCard: View {
    let symbol: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.m) {
            Image(systemName: symbol).font(.headline).foregroundStyle(Color.brandPrimary)
            Text(text).font(.subheadline).foregroundStyle(Color.brandDeep)
        }
        .padding(Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.brandTint, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }
}
