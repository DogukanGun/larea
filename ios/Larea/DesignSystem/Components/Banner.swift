import SwiftUI

enum BannerKind {
    case info, warning, danger

    var symbol: String {
        switch self {
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger: return "xmark.octagon.fill"
        }
    }

    var tint: Color {
        switch self {
        case .info: return .brandPrimary
        case .warning: return .orange
        case .danger: return .danger
        }
    }
}

/// A slim status strip on bar material; meant for `.safeAreaInset(edge: .top)`.
struct Banner: View {
    let kind: BannerKind
    let text: String

    var body: some View {
        HStack(spacing: Spacing.s) {
            Image(systemName: kind.symbol).foregroundStyle(kind.tint)
            Text(text).font(.subheadline).foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.l)
        .padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityElement(children: .combine)
    }
}

/// Inline error card used inside forms.
struct InlineError: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.s) {
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.danger)
            Text(text).font(.subheadline)
        }
        .padding(Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.danger.opacity(0.10), in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
    }
}
