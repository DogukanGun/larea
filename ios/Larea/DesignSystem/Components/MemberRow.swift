import SwiftUI

struct MemberRow: View {
    let name: String
    let seed: String
    var isMe = false

    var body: some View {
        HStack(spacing: Spacing.m) {
            Avatar(name: name, seed: seed, size: 36)
            Text(name).font(.lareaHeadline).lineLimit(1)
            Spacer()
            if isMe { Pill(text: "You", style: .tint) }
        }
        .padding(.vertical, 2)
    }
}
