import Foundation

struct APIErrorBody: Decodable, Sendable {
    var code: String = "ERROR"
    var message: String = "Something went wrong."
    var mutedUntil: String?
    var retryAfterSec: Int?
    var suspendedAt: String?
}

struct ActiveMembership: Codable, Sendable, Equatable {
    let venueId: String
    let venueName: String
    let joinedAt: String
}

/// What the backend supports; missing on older servers, in which case everything new is off.
struct Features: Codable, Sendable, Equatable {
    var images = false
    var polls = false
    var market = false
    var payments = false

    static let none = Features()
}

struct MeView: Codable, Sendable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let role: String
    let ageVerified: Bool
    let ageVerifiedAt: String?
    let mutedUntil: String?
    let suspendedAt: String?
    let createdAt: String
    let activeMembership: ActiveMembership?
    var features: Features? = nil

    var capabilities: Features { features ?? .none }
}

extension Features {
    private enum Keys: String, CodingKey { case images, polls, market, payments }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        images = try c.decodeIfPresent(Bool.self, forKey: .images) ?? false
        polls = try c.decodeIfPresent(Bool.self, forKey: .polls) ?? false
        market = try c.decodeIfPresent(Bool.self, forKey: .market) ?? false
        payments = try c.decodeIfPresent(Bool.self, forKey: .payments) ?? false
    }
}

struct Member: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let displayName: String
}

struct MembersResponse: Decodable, Sendable {
    let members: [Member]
    let count: Int
}

struct AuthResult: Decodable, Sendable {
    let accessToken: String
    let accessExpiresInSec: Int
    let refreshToken: String
    let user: MeView
}

struct RegisterRequest: Encodable, Sendable {
    let email: String
    let password: String
    let displayName: String
    let deviceLabel: String?
}

struct LoginRequest: Encodable, Sendable {
    let email: String
    let password: String
    let deviceLabel: String?
}

struct RefreshRequest: Encodable, Sendable { let refreshToken: String }
struct UpdateMeRequest: Encodable, Sendable { let displayName: String }

struct VerificationStatus: Decodable, Sendable, Equatable {
    let verified: Bool
    let verifiedAt: String?
    let ageThreshold: Int
    let lastOutcome: String?
    /// Present on the platform endpoint's response: under_age, declined, unknown_age.
    var reason: String?
}

/// The operating system's answer to the age-range prompt, forwarded to the backend.
struct PlatformAgeRequest: Encodable, Sendable {
    let platform: String
    let lowerBound: Int?
    let upperBound: Int?
    let declaration: String
}

enum VenueCategory: String, Codable, Sendable, CaseIterable {
    case library, station, square, university, stadium, museum, mall, park, cafe, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = VenueCategory(rawValue: raw) ?? .unknown
    }

    var label: String {
        switch self {
        case .library: return "Library"
        case .station: return "Station"
        case .square: return "Square"
        case .university: return "University"
        case .stadium: return "Stadium"
        case .museum: return "Museum & theatre"
        case .mall: return "Shopping"
        case .park: return "Park"
        case .cafe: return "Café"
        case .unknown: return "Place"
        }
    }

    var symbol: String {
        switch self {
        case .library: return "books.vertical.fill"
        case .station: return "tram.fill"
        case .square: return "building.columns.fill"
        case .university: return "graduationcap.fill"
        case .stadium: return "sportscourt.fill"
        case .museum: return "theatermasks.fill"
        case .mall: return "bag.fill"
        case .park: return "tree.fill"
        case .cafe: return "cup.and.saucer.fill"
        case .unknown: return "mappin.circle.fill"
        }
    }
}

struct NearbyVenue: Sendable, Identifiable, Equatable {
    let id: String
    let slug: String
    let name: String
    let label: String
    var category: VenueCategory = .unknown
    var address: String?
    let lat: Double
    let lng: Double
    var distanceM: Int = 0
    let eligible: Bool
    let memberCount: Int

    /// "80 m" / "1.2 km"
    var distanceText: String {
        distanceM < 1000 ? "\(distanceM) m" : String(format: "%.1f km", Double(distanceM) / 1000)
    }
}

extension NearbyVenue: Decodable {
    private enum Keys: String, CodingKey { case id, slug, name, label, category, address, lat, lng, distanceM, eligible, memberCount }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        slug = try c.decode(String.self, forKey: .slug)
        name = try c.decode(String.self, forKey: .name)
        label = try c.decode(String.self, forKey: .label)
        category = try c.decodeIfPresent(VenueCategory.self, forKey: .category) ?? .unknown
        address = try c.decodeIfPresent(String.self, forKey: .address)
        lat = try c.decode(Double.self, forKey: .lat)
        lng = try c.decode(Double.self, forKey: .lng)
        distanceM = try c.decodeIfPresent(Int.self, forKey: .distanceM) ?? 0
        eligible = try c.decode(Bool.self, forKey: .eligible)
        memberCount = try c.decode(Int.self, forKey: .memberCount)
    }
}

struct NearbyResponse: Decodable, Sendable {
    let venues: [NearbyVenue]
    /// Places for this area are still being discovered; poll again shortly.
    let pending: Bool
    let degraded: Bool
    let attribution: String?

    private enum Keys: String, CodingKey { case venues, pending, degraded, attribution }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        venues = try c.decode([NearbyVenue].self, forKey: .venues)
        pending = try c.decodeIfPresent(Bool.self, forKey: .pending) ?? false
        degraded = try c.decodeIfPresent(Bool.self, forKey: .degraded) ?? false
        attribution = try c.decodeIfPresent(String.self, forKey: .attribution)
    }
}

struct LocationFixBody: Encodable, Sendable {
    let lat: Double
    let lng: Double
    let accuracy: Double
    let mocked: Bool?
}

struct VenueView: Decodable, Sendable {
    let id: String
    let slug: String
    let name: String
    let label: String
    let category: VenueCategory
    let address: String?

    private enum Keys: String, CodingKey { case id, slug, name, label, category, address }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        slug = try c.decode(String.self, forKey: .slug)
        name = try c.decode(String.self, forKey: .name)
        label = try c.decode(String.self, forKey: .label)
        category = try c.decodeIfPresent(VenueCategory.self, forKey: .category) ?? .unknown
        address = try c.decodeIfPresent(String.self, forKey: .address)
    }
}

struct MembershipInfo: Decodable, Sendable {
    let id: String
    let venueId: String
    let joinedAt: String
}

struct Timing: Decodable, Sendable {
    var heartbeatIntervalSec: Int = 25
    var staleAfterSec: Int = 120
    var weakGpsGraceSec: Int = 300
}

struct JoinResult: Decodable, Sendable {
    let membership: MembershipInfo
    let venue: VenueView
    let timing: Timing
    let memberCount: Int
}

struct Author: Codable, Sendable, Equatable {
    let id: String
    let displayName: String
}

struct ChatMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let venueId: String
    let author: Author
    let text: String
    let status: String
    let createdAt: String
}

struct SendMessageRequest: Encodable, Sendable {
    let text: String
    let clientKey: String
}

struct SendResult: Decodable, Sendable {
    let status: String
    let message: ChatMessage?
    let notice: String?
}

struct HistoryResponse: Decodable, Sendable { let messages: [ChatMessage] }

struct CreateReportRequest: Encodable, Sendable {
    let reason: String
    let details: String?
}

struct BlockedUser: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let blockedAt: String
}

struct BlocksResponse: Decodable, Sendable { let blocks: [BlockedUser] }
