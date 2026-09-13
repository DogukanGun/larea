import Foundation

/// Loosely typed JSON used for the free-form `data` field of ack events.
enum JSONValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case object([String: JSONValue])
    case array([JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let b = try? container.decode(Bool.self) { self = .bool(b) }
        else if let n = try? container.decode(Double.self) { self = .number(n) }
        else if let s = try? container.decode(String.self) { self = .string(s) }
        else if let o = try? container.decode([String: JSONValue].self) { self = .object(o) }
        else if let a = try? container.decode([JSONValue].self) { self = .array(a) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "unsupported JSON") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(s): try container.encode(s)
        case let .number(n): try container.encode(n)
        case let .bool(b): try container.encode(b)
        case .null: try container.encodeNil()
        case let .object(o): try container.encode(o)
        case let .array(a): try container.encode(a)
        }
    }

    var stringValue: String? { if case let .string(s) = self { return s }; return nil }
    var boolValue: Bool? { if case let .bool(b) = self { return b }; return nil }
    var intValue: Int? { if case let .number(n) = self { return Int(n) }; return nil }
    var objectValue: [String: JSONValue]? { if case let .object(o) = self { return o }; return nil }
}
