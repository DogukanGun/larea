import Foundation

struct MultipartPart: Sendable {
    let name: String
    let filename: String?
    let mimeType: String?
    let data: Data

    static func file(_ name: String, filename: String, mimeType: String, data: Data) -> MultipartPart {
        MultipartPart(name: name, filename: filename, mimeType: mimeType, data: data)
    }

    static func text(_ name: String, _ value: String) -> MultipartPart {
        MultipartPart(name: name, filename: nil, mimeType: nil, data: Data(value.utf8))
    }
}

/// `multipart/form-data` encoding (RFC 7578) for uploads; the body is built in memory.
enum Multipart {
    static func boundary() -> String {
        "Larea-" + (0..<16).map { _ in String(format: "%02x", Int.random(in: 0...255)) }.joined()
    }

    static func encode(_ parts: [MultipartPart], boundary: String) -> Data {
        var body = Data()
        for part in parts {
            body.append("--\(boundary)\r\n")
            var disposition = "Content-Disposition: form-data; name=\"\(part.name)\""
            if let filename = part.filename { disposition += "; filename=\"\(filename)\"" }
            body.append(disposition + "\r\n")
            if let mimeType = part.mimeType { body.append("Content-Type: \(mimeType)\r\n") }
            body.append("\r\n")
            body.append(part.data)
            body.append("\r\n")
        }
        body.append("--\(boundary)--\r\n")
        return body
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
