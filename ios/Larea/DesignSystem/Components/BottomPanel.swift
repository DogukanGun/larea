import SwiftUI

enum PanelDetent: Hashable, CaseIterable {
    case small, medium, large
}

/// A draggable card pinned to the bottom of its container, above the tab bar. The header strip
/// is the drag surface; the content (usually a List) scrolls on its own.
struct BottomPanel<Header: View, Content: View>: View {
    @Binding var detent: PanelDetent
    @ViewBuilder let header: () -> Header
    @ViewBuilder let content: () -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var dragOffset: CGFloat = 0

    private static var smallHeight: CGFloat { 150 }

    var body: some View {
        GeometryReader { geo in
            let heights = heights(in: geo.size.height)
            let target = heights[detent] ?? Self.smallHeight
            let height = min(max(target - dragOffset, Self.smallHeight), heights[.large] ?? target)
            VStack(spacing: 0) {
                VStack(spacing: Spacing.s) {
                    Capsule().fill(Color(.tertiaryLabel)).frame(width: 36, height: 5).padding(.top, 8)
                    header()
                }
                .frame(maxWidth: .infinity)
                .padding(.bottom, Spacing.s)
                .contentShape(Rectangle())
                .gesture(drag(heights: heights))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("panel.handle")
                .accessibilityAdjustableAction { direction in
                    let all = PanelDetent.allCases
                    guard let index = all.firstIndex(of: detent) else { return }
                    switch direction {
                    case .increment: detent = all[min(index + 1, all.count - 1)]
                    case .decrement: detent = all[max(index - 1, 0)]
                    @unknown default: break
                    }
                }
                content()
            }
            .frame(width: geo.size.width, height: height, alignment: .top)
            .background(.regularMaterial, in: UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.12), radius: 12, y: -2)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .animation(reduceMotion ? nil : .spring(duration: 0.35), value: detent)
            .animation(reduceMotion ? nil : .interactiveSpring(), value: dragOffset)
        }
    }

    private func heights(in total: CGFloat) -> [PanelDetent: CGFloat] {
        [.small: Self.smallHeight, .medium: max(Self.smallHeight, total * 0.5), .large: max(Self.smallHeight, total - 24)]
    }

    private func drag(heights: [PanelDetent: CGFloat]) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .updating($dragOffset) { value, state, _ in state = value.translation.height }
            .onEnded { value in
                let current = heights[detent] ?? Self.smallHeight
                let projected = current - value.predictedEndTranslation.height
                detent = heights.min { abs($0.value - projected) < abs($1.value - projected) }?.key ?? detent
            }
    }
}
