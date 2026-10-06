import CoreLocation
import Foundation

/// How far a pin is from where its buyer stood: decides the price and how long it stays up.
enum PinTier: String, Codable, Sendable, CaseIterable {
    case nearby = "NEARBY"
    case city = "CITY"
    case country = "COUNTRY"
    case world = "WORLD"

    var productId: String { "com.dogukangundogan.larea.pin.\(rawValue.lowercased())" }

    var title: String {
        switch self {
        case .nearby: return "Near you"
        case .city: return "In your city"
        case .country: return "In your country"
        case .world: return "Abroad"
        }
    }

    var symbol: String {
        switch self {
        case .nearby: return "location.fill"
        case .city: return "building.2.fill"
        case .country: return "flag.fill"
        case .world: return "globe.europe.africa.fill"
        }
    }
}

/// A message pinned to a spot on the map, with a chat under it run by whoever paid for it.
struct MessagePin: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    var text: String
    let tier: PinTier
    let status: String
    let lat: Double
    let lng: Double
    let owner: Author
    let mine: Bool
    let createdAt: String
    let expiresAt: String?
    var editedAt: String?
    var messageCount: Int = 0
    var distanceM: Int?
    var eligible: Bool?

    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
    var expiresDate: Date? { expiresAt.flatMap { ISO8601DateFormatter.larea.date(from: $0) } }
    var isLive: Bool { status == "ACTIVE" && (expiresDate.map { $0 > .now } ?? false) }
    /// The owner can always chat; everyone else needs to be close.
    var canChat: Bool { mine || eligible == true }

    var distanceText: String? {
        guard let distanceM else { return nil }
        return distanceM < 1000 ? "\(distanceM) m" : String(format: "%.1f km", Double(distanceM) / 1000)
    }
}

struct PinsResponse: Decodable, Sendable {
    let pins: [MessagePin]
}

struct PinQuote: Decodable, Sendable, Equatable {
    let pin: MessagePin
    let tier: PinTier
    let productId: String
    let priceUsd: String
    let durationHours: Int
    let buyerCity: String?
    let targetCity: String?
    let notice: String?

    var durationText: String {
        durationHours < 48 ? "\(durationHours) hours" : "\(durationHours / 24) days"
    }
}

struct PinQuoteRequest: Encodable, Sendable {
    let lat: Double
    let lng: Double
    let text: String
    let fix: LocationFixBody
}

struct PinPurchaseRequest: Encodable, Sendable {
    let platform = "apple"
    let signedTransaction: String
}

struct PinTextRequest: Encodable, Sendable {
    let text: String
}

struct PinMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let pinId: String
    let author: Author
    let text: String
    let status: String
    let createdAt: String
}

struct PinMessagesResponse: Decodable, Sendable {
    let messages: [PinMessage]
}

struct SendPinMessageRequest: Encodable, Sendable {
    let text: String
    let clientKey: String
    let fix: LocationFixBody?
}

struct PinSendResult: Decodable, Sendable {
    let status: String
    let message: PinMessage?
    let notice: String?
}

struct BanUserRequest: Encodable, Sendable {
    let userId: String
}

struct PinReportRequest: Encodable, Sendable {
    let reason: String
}
