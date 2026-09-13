import ImageIO
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import Larea

final class ImageDownsizeTests: XCTestCase {
    private func photo(width: CGFloat, height: CGFloat) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1 // pixel size == point size, regardless of the simulator's screen scale
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).jpegData(withCompressionQuality: 0.9) { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    /// The same picture with a GPS position and camera make written into its EXIF, like a real photo.
    private func geotagged(_ jpeg: Data) throws -> Data {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(jpeg as CFData, nil))
        let output = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil))
        let properties: [CFString: Any] = [
            kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 48.1374, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 11.5755, kCGImagePropertyGPSLongitudeRef: "E"],
            kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "TestCam", kCGImagePropertyTIFFModel: "X1"],
            kCGImagePropertyExifDictionary: [kCGImagePropertyExifLensModel: "Test lens"],
        ]
        CGImageDestinationAddImageFromSource(destination, source, 0, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }

    func testDownsizesToTheLongEdgeAndKeepsAspect() throws {
        let out = try ImageUploader.downsizedJPEG(photo(width: 4000, height: 3000))
        XCTAssertEqual(out.width, 1600)
        XCTAssertEqual(out.height, 1200)
        XCTAssertEqual([UInt8](out.data.prefix(2)), [0xFF, 0xD8]) // JPEG magic
    }

    func testSmallPhotosAreNotEnlarged() throws {
        let out = try ImageUploader.downsizedJPEG(photo(width: 300, height: 200))
        XCTAssertEqual(out.width, 300)
        XCTAssertEqual(out.height, 200)
    }

    func testLocationAndCameraMetadataAreDropped() throws {
        let input = try geotagged(photo(width: 800, height: 600))
        let before = CGImageSourceCopyPropertiesAtIndex(try XCTUnwrap(CGImageSourceCreateWithData(input as CFData, nil)), 0, nil) as? [CFString: Any] ?? [:]
        XCTAssertNotNil(before[kCGImagePropertyGPSDictionary], "the fixture should carry a GPS block")

        let out = try ImageUploader.downsizedJPEG(input)
        let source = try XCTUnwrap(CGImageSourceCreateWithData(out.data as CFData, nil))
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
        XCTAssertNil(props[kCGImagePropertyGPSDictionary], "GPS must not survive the re-encode")
        XCTAssertNil(props[kCGImagePropertyTIFFDictionary], "camera make/model must not survive")
        let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
        XCTAssertNil(exif[kCGImagePropertyExifLensModel])
        // ImageIO always writes the pixel dimensions; nothing else may remain.
        let allowed: Set<String> = [kCGImagePropertyExifPixelXDimension as String, kCGImagePropertyExifPixelYDimension as String, kCGImagePropertyExifColorSpace as String]
        XCTAssertTrue(Set(exif.keys.map { $0 as String }).isSubset(of: allowed), "unexpected EXIF keys: \(exif.keys)")
    }

    func testGarbageIsRejected() {
        XCTAssertThrowsError(try ImageUploader.downsizedJPEG(Data("not an image".utf8)))
    }
}
