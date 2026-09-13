import SwiftUI

/// Progress through a fixed set of steps; `failed` paints the current step red.
struct StatusStepper: View {
    let steps: [String]
    let current: Int?
    var failed = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, title in
                VStack(spacing: 6) {
                    ZStack {
                        Circle().fill(color(for: index)).frame(width: 26, height: 26)
                        if let current, index < current {
                            Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundStyle(.white)
                        } else if failed, index == (current ?? 0) {
                            Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(.white)
                        } else {
                            Text("\(index + 1)").font(.caption.weight(.bold)).foregroundStyle(index == current ? Color.white : .secondary)
                        }
                    }
                    Text(title).font(.caption2.weight(.semibold)).foregroundStyle(index == current ? Color.primary : .secondary).multilineTextAlignment(.center).lineLimit(2)
                }
                .frame(maxWidth: .infinity)
                if index < steps.count - 1 {
                    Rectangle().fill(current.map { index < $0 } == true ? Color.success : Color(.tertiarySystemFill)).frame(height: 3).frame(maxWidth: 40).padding(.top, 12)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(current.map { "Step \($0 + 1) of \(steps.count): \(steps[$0])" } ?? "Deal ended")
    }

    private func color(for index: Int) -> Color {
        guard let current else { return Color(.tertiarySystemFill) }
        if failed, index == current { return .danger }
        if index < current { return .success }
        if index == current { return .brandPrimary }
        return Color(.tertiarySystemFill)
    }
}
