import SwiftUI

/// Full-screen photo with pinch zoom; swipe down (when not zoomed) or the close button dismisses.
struct ImageViewer: View {
    let image: ImageAttachment
    var preview: UIImage? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var full: UIImage?

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            Group {
                if let full {
                    Image(uiImage: full).resizable().aspectRatio(contentMode: .fit)
                } else if let preview {
                    Image(uiImage: preview).resizable().aspectRatio(contentMode: .fit)
                } else {
                    RemoteImage(url: image.thumbURL, contentMode: .fit)
                }
            }
            .scaleEffect(scale)
            .offset(offset)
            .gesture(
                MagnifyGesture()
                    .onChanged { value in scale = min(4, max(1, lastScale * value.magnification)) }
                    .onEnded { _ in lastScale = scale }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in if scale == 1 { offset = CGSize(width: 0, height: max(0, value.translation.height)) } }
                    .onEnded { value in
                        if scale == 1, value.translation.height > 120 { dismiss() } else { withAnimation(.spring) { offset = .zero } }
                    }
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring) {
                    scale = scale > 1 ? 1 : 2.5
                    lastScale = scale
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .padding()
            .accessibilityLabel("Close")
            .accessibilityIdentifier("image.viewer.close")
        }
        .preferredColorScheme(.dark)
        .task {
            if let url = image.fullURL { full = try? await ImageCache.shared.image(for: url) }
        }
    }
}
