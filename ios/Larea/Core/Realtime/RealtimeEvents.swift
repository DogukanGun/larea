import Foundation

/// Server → client events; mirrors docs/realtime-protocol.md.
enum ServerEvent: Sendable, Equatable {
    struct Ack: Sendable, Equatable {
        let reqId: String?
        let ok: Bool
        let reason: String?
        let data: [String: JSONValue]?
    }

    case ack(Ack)
    case message(ChatMessage)
    case messageHidden(venueId: String, messageId: String)
    case removed(venueId: String, reason: String, message: String)
    case enforcement(kind: String, until: String?, message: String)
    case presence(venueId: String, count: Int)
    case pollUpdate(venueId: String, messageId: String, poll: PollView)
    case pong(reqId: String?)
    case error(reqId: String?, code: String, message: String)
}

extension ServerEvent: Decodable {
    private enum Keys: String, CodingKey {
        case type, reqId, ok, reason, data, message, venueId, messageId, kind, until, count, code, poll
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "ack":
            self = .ack(Ack(
                reqId: try c.decodeIfPresent(String.self, forKey: .reqId),
                ok: try c.decode(Bool.self, forKey: .ok),
                reason: try c.decodeIfPresent(String.self, forKey: .reason),
                data: try c.decodeIfPresent([String: JSONValue].self, forKey: .data)
            ))
        case "message":
            self = .message(try c.decode(ChatMessage.self, forKey: .message))
        case "message_hidden":
            self = .messageHidden(venueId: try c.decode(String.self, forKey: .venueId), messageId: try c.decode(String.self, forKey: .messageId))
        case "removed":
            self = .removed(
                venueId: try c.decode(String.self, forKey: .venueId),
                reason: try c.decode(String.self, forKey: .reason),
                message: try c.decode(String.self, forKey: .message)
            )
        case "enforcement":
            self = .enforcement(
                kind: try c.decode(String.self, forKey: .kind),
                until: try c.decodeIfPresent(String.self, forKey: .until),
                message: try c.decode(String.self, forKey: .message)
            )
        case "presence":
            self = .presence(venueId: try c.decode(String.self, forKey: .venueId), count: try c.decode(Int.self, forKey: .count))
        case "poll_update":
            self = .pollUpdate(
                venueId: try c.decode(String.self, forKey: .venueId),
                messageId: try c.decode(String.self, forKey: .messageId),
                poll: try c.decode(PollView.self, forKey: .poll)
            )
        case "pong":
            self = .pong(reqId: try c.decodeIfPresent(String.self, forKey: .reqId))
        case "error":
            self = .error(
                reqId: try c.decodeIfPresent(String.self, forKey: .reqId),
                code: try c.decode(String.self, forKey: .code),
                message: try c.decode(String.self, forKey: .message)
            )
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "unknown event type \(other)")
        }
    }
}

struct HeartbeatAck: Sendable, Equatable {
    let ok: Bool
    let state: String?
    let removed: Bool
    let reason: String?
}

enum ConnectionState: Sendable, Equatable {
    case disconnected, connecting, connected, suspended
}

/// Reconnect delay in seconds for the given attempt (1 s, 2 s, 4 s, ... capped at 30 s).
func reconnectDelay(attempt: Int) -> Double {
    min(30, pow(2, Double(min(max(attempt - 1, 0), 5))))
}
