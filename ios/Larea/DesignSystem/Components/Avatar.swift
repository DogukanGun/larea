import SwiftUI

/// Initials on a color picked deterministically from the user id.
struct Avatar: View {
    let name: String
    let seed: String
    var size: CGFloat = 36

    static let palette: [Color] = [
        Color(red: 0.37, green: 0.23, blue: 0.93), // violet
        Color(red: 1.00, green: 0.42, blue: 0.36), // coral
        Color(red: 0.05, green: 0.66, blue: 0.62), // teal
        Color(red: 0.96, green: 0.62, blue: 0.10), // amber
        Color(red: 0.91, green: 0.30, blue: 0.62), // pink
        Color(red: 0.16, green: 0.50, blue: 0.96), // blue
    ]

    static func colorIndex(for seed: String) -> Int {
        Int(stableHash(seed) % UInt64(palette.count))
    }

    static func initials(for name: String) -> String {
        let parts = name.split(whereSeparator: { $0 == " " || $0 == "_" || $0 == "." }).prefix(2)
        let letters = parts.compactMap { $0.first }.map { String($0).uppercased() }
        return letters.isEmpty ? "?" : letters.joined()
    }

    var body: some View {
        Text(Self.initials(for: name))
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Self.palette[Self.colorIndex(for: seed)], in: Circle())
            .accessibilityHidden(true)
    }
}
