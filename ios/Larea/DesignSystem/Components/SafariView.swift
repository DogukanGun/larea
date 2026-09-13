import SafariServices
import SwiftUI

struct SafariItem: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }
}

/// The system in-app browser, used for Stripe onboarding and Checkout (no Stripe SDK needed).
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    var onDone: () -> Void = {}

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: config)
        controller.preferredControlTintColor = UIColor(Color.brandPrimary)
        controller.dismissButtonStyle = .close
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onDone() }
    }
}
