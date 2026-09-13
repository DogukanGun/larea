import SwiftUI

struct LogoMark: View {
    var size: CGFloat = 44

    var body: some View {
        Image("LaunchLogo")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(Color.brandPrimary)
            .accessibilityHidden(true)
    }
}

struct Wordmark: View {
    var body: some View {
        HStack(spacing: 10) {
            LogoMark(size: 40)
            Text("Larea").font(.system(size: 38, weight: .heavy, design: .rounded)).foregroundStyle(.primary)
        }
        .accessibilityLabel("Larea")
    }
}
