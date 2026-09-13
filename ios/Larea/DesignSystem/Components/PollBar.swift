import SwiftUI

/// One poll option: a tappable bar that fills to its share of the votes once results are shown.
struct PollBar: View {
    let text: String
    let fraction: Double
    let percent: Int
    let selected: Bool
    let showResults: Bool
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Spacing.s) {
                if selected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.brandPrimary)
                }
                Text(text).font(.body.weight(selected ? .semibold : .regular)).foregroundStyle(.primary).lineLimit(2)
                Spacer(minLength: Spacing.s)
                if showResults {
                    Text("\(percent)%").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).monospacedDigit()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            // The share of votes is drawn by scaling a full-width fill from the leading edge: no geometry reads needed.
            .background {
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(.tertiarySystemFill))
                    if showResults {
                        Rectangle()
                            .fill(selected ? Color.brandPrimary.opacity(0.28) : Color.brandTint)
                            .scaleEffect(x: min(1, max(0.001, fraction)), y: 1, anchor: .leading)
                            .animation(.spring(duration: 0.35), value: fraction)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            }
            .contentShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(showResults ? "\(text), \(percent) percent" : text)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
