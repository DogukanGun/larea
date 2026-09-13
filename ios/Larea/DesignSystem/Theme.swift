import SwiftUI

extension Color {
    static let brandPrimary = Color("BrandPrimary")
    static let brandDeep = Color("BrandDeep")
    static let brandTint = Color("BrandTint")
    static let sunny = Color("Sunny")
    static let success = Color("Success")
    static let danger = Color("Danger")
}

enum Spacing {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    /// Horizontal margin from the screen edge, shared by every screen, list and panel (matches the system inset-grouped list).
    static let screen: CGFloat = 16
}

enum Radius {
    static let field: CGFloat = 14
    static let button: CGFloat = 16
    static let card: CGFloat = 20
    static let bubble: CGFloat = 20
}

extension Font {
    /// Display type: rounded and bold, for titles, section titles, buttons and the wordmark.
    static let lareaTitle = Font.system(.largeTitle, design: .rounded, weight: .bold)
    static let lareaTitle2 = Font.system(.title2, design: .rounded, weight: .bold)
    static let lareaTitle3 = Font.system(.title3, design: .rounded, weight: .bold)
    static let lareaHeadline = Font.system(.headline, design: .rounded, weight: .semibold)
    static let lareaButton = Font.system(.headline, design: .rounded, weight: .semibold)
    static let lareaCaptionBold = Font.system(.caption, design: .rounded, weight: .bold)
}

/// FNV-1a 64-bit; stable across launches (unlike `hashValue`).
func stableHash(_ string: String) -> UInt64 {
    var hash: UInt64 = 0xcbf29ce484222325
    for byte in string.utf8 {
        hash ^= UInt64(byte)
        hash = hash &* 0x100000001b3
    }
    return hash
}
