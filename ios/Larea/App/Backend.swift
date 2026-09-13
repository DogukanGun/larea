import Foundation

/// Backend endpoints. Order: process environment (Xcode scheme / `simctl launch` env), then
/// the per-configuration values injected into Info.plist (see project.yml).
enum Backend {
    static var apiBaseURL: URL {
        URL(string: env("LAREA_API_BASE_URL") ?? plist("LareaAPIBaseURL") ?? "http://localhost:3000/")!
    }

    static var webSocketURL: URL {
        URL(string: env("LAREA_WS_URL") ?? plist("LareaWebSocketURL") ?? "ws://localhost:3000/ws")!
    }

    /// Absolute URL for an image the API returned (absolute already, or relative like `/media/x.jpg`).
    static func mediaURL(_ raw: String) -> URL? {
        URL(string: raw, relativeTo: apiBaseURL)?.absoluteURL
    }

    private static func env(_ key: String) -> String? {
        ProcessInfo.processInfo.environment[key].flatMap { $0.isEmpty ? nil : $0 }
    }

    private static func plist(_ key: String) -> String? {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String).flatMap { $0.isEmpty || $0.hasPrefix("$(") ? nil : $0 }
    }
}
