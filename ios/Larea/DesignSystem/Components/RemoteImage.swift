import SwiftUI

/// An image from the API's media store, loaded through `ImageCache` (AsyncImage has no cache).
struct RemoteImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            } else {
                Color(.tertiarySystemFill)
                Image(systemName: failed ? "photo.badge.exclamationmark" : "photo")
                    .font(.title2)
                    .foregroundStyle(.tertiary)
            }
        }
        .task(id: url) {
            image = nil
            failed = false
            guard let url else { failed = true; return }
            do {
                image = try await ImageCache.shared.image(for: url)
            } catch {
                failed = true
            }
        }
        .animation(.easeInOut(duration: 0.2), value: image == nil)
    }
}
