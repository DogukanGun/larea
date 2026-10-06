import SwiftUI
import UIKit

/// Swipe a message to the right to answer it: the row follows the finger, a reply arrow fades in,
/// and letting go past the threshold starts the reply. Only rightward, mostly horizontal drags
/// begin, so scrolling the chat and long-pressing for the menu keep working.
struct SwipeToReply: ViewModifier {
    let onReply: () -> Void
    @State private var offset: CGFloat = 0
    @State private var armed = false

    private static let trigger: CGFloat = 56
    private static let limit: CGFloat = 72

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .background(alignment: .leading) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.brandPrimary)
                    .frame(width: 30, height: 30)
                    .background(Color.brandTint, in: Circle())
                    .scaleEffect(armed ? 1.1 : 0.7)
                    .opacity(Double(min(1, offset / Self.trigger)))
                    .accessibilityHidden(true)
            }
            .gesture(
                HorizontalSwipe(
                    onChange: { dx in
                        offset = min(Self.limit, max(0, dx * 0.8))
                        if (offset >= Self.trigger) != armed { armed.toggle() }
                    },
                    onEnd: {
                        if armed { onReply() }
                        armed = false
                        withAnimation(.spring(duration: 0.3)) { offset = 0 }
                    }
                )
            )
            .sensoryFeedback(.impact(weight: .light), trigger: armed) { _, isArmed in isArmed }
            .accessibilityAction(named: "Reply", onReply)
    }
}

/// A pan that only starts for rightward, mostly horizontal movement and never blocks the scroll view.
private struct HorizontalSwipe: UIGestureRecognizerRepresentable {
    let onChange: (CGFloat) -> Void
    let onEnd: () -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .changed: onChange(recognizer.translation(in: recognizer.view).x)
        case .ended, .cancelled, .failed: onEnd()
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view)
            return velocity.x > 0 && abs(velocity.x) > abs(velocity.y) * 1.5
        }

        /// Runs alongside the chat's scroll view, which would otherwise claim every pan.
        func gestureRecognizer(_ recognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            other.view is UIScrollView
        }
    }
}
