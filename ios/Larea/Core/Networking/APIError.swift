import Foundation

enum APIError: Error, LocalizedError, Sendable {
    /// A structured `{code, message}` error from the backend.
    case api(code: String, message: String, status: Int, mutedUntil: String?, retryAfterSec: Int?)
    case network(underlying: String)
    case decoding(String)
    case unauthenticated

    var code: String? {
        if case let .api(code, _, _, _, _) = self { return code }
        return nil
    }

    var mutedUntil: String? {
        if case let .api(_, _, _, mutedUntil, _) = self { return mutedUntil }
        return nil
    }

    var retryAfterSec: Int? {
        if case let .api(_, _, _, _, retry) = self { return retry }
        return nil
    }

    var errorDescription: String? {
        switch self {
        case let .api(_, message, _, _, _): return message
        case .network: return "Can't reach Larea. Check your connection and try again."
        case .decoding: return "Unexpected response from the server."
        case .unauthenticated: return "Please sign in again."
        }
    }
}

extension Error {
    var userMessage: String {
        (self as? APIError)?.errorDescription ?? localizedDescription
    }
}
