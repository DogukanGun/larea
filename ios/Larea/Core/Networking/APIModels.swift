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

enum MessageKind: String, Codable, Sendable, Equatable {
    case text = "TEXT"
    case image = "IMAGE"
    case poll = "POLL"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = MessageKind(rawValue: raw) ?? .unknown
    }
}

/// A served photo: the upload response and the `image` of a chat message share this shape.
struct ImageAttachment: Codable, Sendable, Equatable, Identifiable {
    var id: String
    let url: String
    let thumbUrl: String
    let width: Int
    let height: Int

    var aspectRatio: CGFloat { height > 0 ? CGFloat(width) / CGFloat(height) : 1 }
    var fullURL: URL? { Backend.mediaURL(url) }
    var thumbURL: URL? { Backend.mediaURL(thumbUrl) }

    private enum Keys: String, CodingKey { case id, url, thumbUrl, width, height }

    init(id: String, url: String, thumbUrl: String, width: Int, height: Int) {
        self.id = id
        self.url = url
        self.thumbUrl = thumbUrl
        self.width = width
        self.height = height
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        url = try c.decode(String.self, forKey: .url)
        thumbUrl = try c.decodeIfPresent(String.self, forKey: .thumbUrl) ?? url
        width = try c.decodeIfPresent(Int.self, forKey: .width) ?? 0
        height = try c.decodeIfPresent(Int.self, forKey: .height) ?? 0
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? url
    }
}

struct PollOptionView: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let text: String
    var votes: Int = 0

    private enum Keys: String, CodingKey { case id, text, votes }

    init(id: String, text: String, votes: Int = 0) {
        self.id = id
        self.text = text
        self.votes = votes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        text = try c.decode(String.self, forKey: .text)
        votes = try c.decodeIfPresent(Int.self, forKey: .votes) ?? 0
    }
}

struct PollView: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let question: String
    var options: [PollOptionView]
    var totalVotes: Int = 0
    /// The viewer's choice; only REST responses carry it, fan-out updates keep the local one.
    var myOptionId: String? = nil
    var closed = false
    var closesAt: String? = nil

    var isClosed: Bool {
        if closed { return true }
        guard let closesAt, let date = ISO8601DateFormatter.larea.date(from: closesAt) else { return false }
        return date <= .now
    }

    func percent(of option: PollOptionView) -> Int {
        totalVotes > 0 ? Int((Double(option.votes) / Double(totalVotes) * 100).rounded()) : 0
    }

    /// Fresh counts from the room, keeping what only we know (our own vote).
    func merging(update: PollView) -> PollView {
        var merged = update
        merged.myOptionId = update.myOptionId ?? myOptionId
        return merged
    }

    private enum Keys: String, CodingKey { case id, question, options, totalVotes, myOptionId, closed, closesAt }

    init(id: String, question: String, options: [PollOptionView], totalVotes: Int = 0, myOptionId: String? = nil, closed: Bool = false, closesAt: String? = nil) {
        self.id = id
        self.question = question
        self.options = options
        self.totalVotes = totalVotes
        self.myOptionId = myOptionId
        self.closed = closed
        self.closesAt = closesAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        question = try c.decode(String.self, forKey: .question)
        options = try c.decodeIfPresent([PollOptionView].self, forKey: .options) ?? []
        totalVotes = try c.decodeIfPresent(Int.self, forKey: .totalVotes) ?? options.reduce(0) { $0 + $1.votes }
        myOptionId = try c.decodeIfPresent(String.self, forKey: .myOptionId)
        closed = try c.decodeIfPresent(Bool.self, forKey: .closed) ?? false
        closesAt = try c.decodeIfPresent(String.self, forKey: .closesAt)
    }
}

struct ChatMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let venueId: String
    let author: Author
    /// Always readable: the message, or a fallback for kinds this build does not render.
    let text: String
    let status: String
    let createdAt: String
    var kind: MessageKind = .text
    var caption: String? = nil
    var image: ImageAttachment? = nil
    var poll: PollView? = nil
    var replyTo: ReplyPreview? = nil
}

/// The message a reply answers, as a short quote. `unavailable` when it was removed or its author is blocked.
struct ReplyPreview: Codable, Sendable, Equatable {
    let id: String
    var author: Author? = nil
    var kind: MessageKind? = nil
    var text: String? = nil
    var unavailable = false

    private enum Keys: String, CodingKey { case id, author, kind, text, unavailable }

    init(id: String, author: Author? = nil, kind: MessageKind? = nil, text: String? = nil, unavailable: Bool = false) {
        self.id = id
        self.author = author
        self.kind = kind
        self.text = text
        self.unavailable = unavailable
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decodeIfPresent(Author.self, forKey: .author)
        kind = try c.decodeIfPresent(MessageKind.self, forKey: .kind)
        text = try c.decodeIfPresent(String.self, forKey: .text)
        unavailable = try c.decodeIfPresent(Bool.self, forKey: .unavailable) ?? false
    }

    /// The quote this app shows for a message before the server's version arrives (same rules as the server).
    static func of(_ message: ChatMessage) -> ReplyPreview {
        let text: String
        switch message.kind {
        case .poll: text = message.poll.map { "Poll: \($0.question)" } ?? message.text
        case .image: text = (message.caption ?? "").isEmpty ? "[Photo]" : message.caption!
        default: text = message.text
        }
        let short = text.count > 140 ? String(text.prefix(139)).trimmingCharacters(in: .whitespaces) + "…" : text
        return ReplyPreview(id: message.id, author: message.author, kind: message.kind, text: short)
    }

    static func gone(_ id: String) -> ReplyPreview { ReplyPreview(id: id, unavailable: true) }
}

extension ChatMessage {
    private enum Keys: String, CodingKey { case id, venueId, author, text, status, createdAt, kind, caption, image, poll, replyTo }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        venueId = try c.decode(String.self, forKey: .venueId)
        author = try c.decode(Author.self, forKey: .author)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "APPROVED"
        createdAt = try c.decode(String.self, forKey: .createdAt)
        kind = try c.decodeIfPresent(MessageKind.self, forKey: .kind) ?? .text
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        image = try c.decodeIfPresent(ImageAttachment.self, forKey: .image)
        poll = try c.decodeIfPresent(PollView.self, forKey: .poll)
        replyTo = try c.decodeIfPresent(ReplyPreview.self, forKey: .replyTo)
    }
}

struct CreatePollRequest: Encodable, Sendable {
    let question: String
    let options: [String]
    var durationMinutes: Int? = nil
    let clientKey: String
}

struct VoteRequest: Encodable, Sendable { let optionId: String }

struct PollResponse: Decodable, Sendable { let poll: PollView }

struct SendMessageRequest: Encodable, Sendable {
    var kind: String? = nil
    var text: String? = nil
    var mediaId: String? = nil
    var replyToId: String? = nil
    let clientKey: String

    static func text(_ text: String, replyToId: String? = nil, clientKey: String) -> SendMessageRequest {
        SendMessageRequest(text: text, replyToId: replyToId, clientKey: clientKey)
    }

    static func image(mediaId: String, caption: String?, replyToId: String? = nil, clientKey: String) -> SendMessageRequest {
        SendMessageRequest(kind: "IMAGE", text: caption.flatMap { $0.isEmpty ? nil : $0 }, mediaId: mediaId, replyToId: replyToId, clientKey: clientKey)
    }
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
