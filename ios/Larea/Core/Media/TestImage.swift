#if DEBUG
import UIKit

/// A deterministic picture for UI tests, drawn at runtime (nothing synthetic ships in the bundle).
enum TestImage {
    static var enabled: Bool { UserDefaults.standard.bool(forKey: "LareaTestSeedImage") }

    static func make() -> Data {
        let size = CGSize(width: 640, height: 480)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let colors = [UIColor.systemIndigo.cgColor, UIColor.systemOrange.cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: CGRect(x: 220, y: 140, width: 200, height: 200))
        }
        return image.jpegData(compressionQuality: 0.9) ?? Data()
    }
}
#endif
