import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ImageUploadError: Error, LocalizedError {
    case unreadable
    case tooLarge
    case unsupported

    var errorDescription: String? {
        switch self {
        case .unreadable: return "That photo couldn't be read."
        case .tooLarge: return "That photo is too large."
        case .unsupported: return "Please choose a JPEG, PNG or WebP photo."
        }
    }
}

/// Downsizes a picked photo on the device (dropping EXIF, including location) and uploads it.
struct ImageUploader: Sendable {
    let api: APIClient
    static let maxPixels = 1600
    static let jpegQuality: CGFloat = 0.82

    func upload(_ data: Data) async throws -> ImageAttachment {
        let jpeg = try await Task.detached(priority: .userInitiated) { try Self.downsizedJPEG(data) }.value
        let request = APIRequest(.POST, "uploads", multipart: [.file("file", filename: "photo.jpg", mimeType: "image/jpeg", data: jpeg.data)])
        do {
            return try await api.send(request)
        } catch let error as APIError {
            switch error.status {
            case 413: throw ImageUploadError.tooLarge
            case 415: throw ImageUploadError.unsupported
            default: throw error
            }
        }
    }

    /// Re-encodes through ImageIO: orientation baked in, no metadata copied.
    static func downsizedJPEG(_ data: Data, maxPixels: Int = maxPixels, quality: CGFloat = jpegQuality) throws -> (data: Data, width: Int, height: Int) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { throw ImageUploadError.unreadable }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw ImageUploadError.unreadable }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { throw ImageUploadError.unreadable }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw ImageUploadError.unreadable }
        return (output as Data, image.width, image.height)
    }
}
