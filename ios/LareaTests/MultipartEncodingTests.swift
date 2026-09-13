import XCTest
@testable import Larea

final class MultipartEncodingTests: XCTestCase {
    func testEncodesPartsWithBoundaryAndCRLF() {
        let body = Multipart.encode([
            .text("kind", "photo"),
            .file("file", filename: "photo.jpg", mimeType: "image/jpeg", data: Data([0xFF, 0xD8, 0xFF])),
        ], boundary: "XYZ")
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("--XYZ\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\nphoto\r\n"))
        XCTAssertTrue(text.contains("--XYZ\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"))
        XCTAssertTrue(text.hasSuffix("\r\n--XYZ--\r\n"))
        // The binary bytes go in untouched, framed by CRLFs.
        XCTAssertNotNil(body.range(of: Data([0x0D, 0x0A, 0x0D, 0x0A, 0xFF, 0xD8, 0xFF, 0x0D, 0x0A])))
    }

    func testUploadRequestCarriesMultipartHeaderAndLongTimeout() {
        let request = APIRequest(.POST, "uploads", multipart: [.file("file", filename: "a.jpg", mimeType: "image/jpeg", data: Data([1, 2, 3]))])
        XCTAssertTrue(request.isUpload)
        XCTAssertTrue(request.contentType?.hasPrefix("multipart/form-data; boundary=Larea-") == true)
        XCTAssertEqual(request.timeout, 90)
        XCTAssertNotNil(request.body)
        let boundary = request.contentType!.replacingOccurrences(of: "multipart/form-data; boundary=", with: "")
        XCTAssertTrue(String(decoding: request.body!, as: UTF8.self).hasSuffix("--\(boundary)--\r\n"))
    }

    func testBoundariesAreUnique() {
        XCTAssertNotEqual(Multipart.boundary(), Multipart.boundary())
    }
}
