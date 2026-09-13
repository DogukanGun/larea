import Foundation

enum ListingKind: String, Codable, Sendable, Equatable, CaseIterable {
    case offer = "OFFER"
    case request = "REQUEST"
    case unknown

    init(from decoder: Decoder) throws {
        self = ListingKind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }

    var label: String {
        switch self {
        case .offer: return "Selling"
        case .request: return "Looking for help"
        case .unknown: return "Listing"
        }
    }
}

enum ListingCategory: String, Codable, Sendable, Equatable, CaseIterable {
    case furniture = "FURNITURE", electronics = "ELECTRONICS", clothing = "CLOTHING", kids = "KIDS", home = "HOME"
    case sports = "SPORTS", books = "BOOKS", services = "SERVICES", help = "HELP", other = "OTHER", unknown

    init(from decoder: Decoder) throws {
        self = ListingCategory(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }

    static var selectable: [ListingCategory] { allCases.filter { $0 != .unknown } }

    var label: String {
        switch self {
        case .furniture: return "Furniture"
        case .electronics: return "Electronics"
        case .clothing: return "Clothing"
        case .kids: return "Kids"
        case .home: return "Home"
        case .sports: return "Sports"
        case .books: return "Books"
        case .services: return "Services"
        case .help: return "Help"
        case .other: return "Other"
        case .unknown: return "Other"
        }
    }

    var symbol: String {
        switch self {
        case .furniture: return "sofa.fill"
        case .electronics: return "laptopcomputer"
        case .clothing: return "tshirt.fill"
        case .kids: return "teddybear.fill"
        case .home: return "house.fill"
        case .sports: return "figure.run"
        case .books: return "books.vertical.fill"
        case .services: return "wrench.and.screwdriver.fill"
        case .help: return "hands.and.sparkles.fill"
        case .other, .unknown: return "shippingbox.fill"
        }
    }
}

enum ListingStatus: String, Codable, Sendable, Equatable {
    case active = "ACTIVE", reserved = "RESERVED", sold = "SOLD", cancelled = "CANCELLED", expired = "EXPIRED", removed = "REMOVED", unknown

    init(from decoder: Decoder) throws {
        self = ListingStatus(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }

    var label: String {
        switch self {
        case .active: return "Active"
        case .reserved: return "Reserved"
        case .sold: return "Sold"
        case .cancelled: return "Cancelled"
        case .expired: return "Expired"
        case .removed: return "Removed"
        case .unknown: return "Listing"
        }
    }
}

struct ListingLocation: Codable, Sendable, Equatable {
    let lat: Double
    let lng: Double
}

struct Listing: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let kind: ListingKind
    let category: ListingCategory
    let title: String
    let description: String
    let priceCents: Int
    let currency: String
    let status: ListingStatus
    let owner: Author
    let mine: Bool
    let images: [ImageAttachment]
    let location: ListingLocation
    let distanceM: Int?
    let offerCount: Int?
    let createdAt: String
    let expiresAt: String
    /// Detail only: the caller's latest offer.
    let myOffer: Offer?
    /// Detail only, owner: offers waiting for an answer.
    let offers: [Offer]?
    let notice: String?

    private enum Keys: String, CodingKey { case id, kind, category, title, description, priceCents, currency, status, owner, mine, images, location, distanceM, offerCount, createdAt, expiresAt, myOffer, offers, notice }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decodeIfPresent(ListingKind.self, forKey: .kind) ?? .unknown
        category = try c.decodeIfPresent(ListingCategory.self, forKey: .category) ?? .unknown
        title = try c.decode(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        priceCents = try c.decodeIfPresent(Int.self, forKey: .priceCents) ?? 0
        currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "eur"
        status = try c.decodeIfPresent(ListingStatus.self, forKey: .status) ?? .unknown
        owner = try c.decode(Author.self, forKey: .owner)
        mine = try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false
        images = try c.decodeIfPresent([ImageAttachment].self, forKey: .images) ?? []
        location = try c.decode(ListingLocation.self, forKey: .location)
        distanceM = try c.decodeIfPresent(Int.self, forKey: .distanceM)
        offerCount = try c.decodeIfPresent(Int.self, forKey: .offerCount)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        myOffer = try c.decodeIfPresent(Offer.self, forKey: .myOffer)
        offers = try c.decodeIfPresent([Offer].self, forKey: .offers)
        notice = try c.decodeIfPresent(String.self, forKey: .notice)
    }

    var distanceText: String? {
        guard let distanceM else { return nil }
        return distanceM < 1000 ? "\(distanceM) m" : String(format: "%.1f km", Double(distanceM) / 1000)
    }
}

struct ListingsResponse: Decodable, Sendable {
    let listings: [Listing]
    let nextOffset: Int?
    let radiusM: Double?
}

enum OfferStatus: String, Codable, Sendable, Equatable {
    case pending = "PENDING", accepted = "ACCEPTED", declined = "DECLINED", withdrawn = "WITHDRAWN", expired = "EXPIRED", unknown

    init(from decoder: Decoder) throws {
        self = OfferStatus(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }

    var label: String {
        switch self {
        case .pending: return "Pending"
        case .accepted: return "Accepted"
        case .declined: return "Declined"
        case .withdrawn: return "Withdrawn"
        case .expired: return "Expired"
        case .unknown: return "Offer"
        }
    }
}

struct ListingSummary: Decodable, Sendable, Equatable {
    let id: String
    let title: String
    let kind: ListingKind
    let priceCents: Int
    let thumbUrl: String?
    let status: ListingStatus

    private enum Keys: String, CodingKey { case id, title, kind, priceCents, thumbUrl, status }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        kind = try c.decodeIfPresent(ListingKind.self, forKey: .kind) ?? .unknown
        priceCents = try c.decodeIfPresent(Int.self, forKey: .priceCents) ?? 0
        thumbUrl = try c.decodeIfPresent(String.self, forKey: .thumbUrl)
        status = try c.decodeIfPresent(ListingStatus.self, forKey: .status) ?? .unknown
    }

    var thumbURL: URL? { thumbUrl.flatMap(Backend.mediaURL) }
}

struct Offer: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let listingId: String
    let listing: ListingSummary
    let offerer: Author
    let amountCents: Int
    let note: String?
    let status: OfferStatus
    let expiresAt: String
    let respondedAt: String?
    let orderId: String?
    let createdAt: String

    private enum Keys: String, CodingKey { case id, listingId, listing, offerer, amountCents, note, status, expiresAt, respondedAt, orderId, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        listingId = try c.decode(String.self, forKey: .listingId)
        listing = try c.decode(ListingSummary.self, forKey: .listing)
        offerer = try c.decode(Author.self, forKey: .offerer)
        amountCents = try c.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
        note = try c.decodeIfPresent(String.self, forKey: .note)
        status = try c.decodeIfPresent(OfferStatus.self, forKey: .status) ?? .unknown
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt) ?? ""
        respondedAt = try c.decodeIfPresent(String.self, forKey: .respondedAt)
        orderId = try c.decodeIfPresent(String.self, forKey: .orderId)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }
}

struct AcceptOfferResponse: Decodable, Sendable {
    let offer: Offer
    let order: Order?
}

struct MarketConfig: Decodable, Sendable, Equatable {
    var enabled = true
    var payments = false
    var testMode = false
    var currency = "eur"
    var radiusM: Double = 2000
    var feePercent: Double = 10
    var feeMinCents = 50
    var minPriceCents = 100
    var maxPriceCents = 50_000
    var maxImages = 5

    private enum Keys: String, CodingKey { case enabled, payments, testMode, currency, radiusM, feePercent, feeMinCents, minPriceCents, maxPriceCents, maxImages }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        payments = try c.decodeIfPresent(Bool.self, forKey: .payments) ?? false
        testMode = try c.decodeIfPresent(Bool.self, forKey: .testMode) ?? false
        currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "eur"
        radiusM = try c.decodeIfPresent(Double.self, forKey: .radiusM) ?? 2000
        feePercent = try c.decodeIfPresent(Double.self, forKey: .feePercent) ?? 10
        feeMinCents = try c.decodeIfPresent(Int.self, forKey: .feeMinCents) ?? 50
        minPriceCents = try c.decodeIfPresent(Int.self, forKey: .minPriceCents) ?? 100
        maxPriceCents = try c.decodeIfPresent(Int.self, forKey: .maxPriceCents) ?? 50_000
        maxImages = try c.decodeIfPresent(Int.self, forKey: .maxImages) ?? 5
    }
}

enum OrderStatus: String, Codable, Sendable, Equatable {
    case awaitingPayment = "AWAITING_PAYMENT", paid = "PAID", completed = "COMPLETED", cancelled = "CANCELLED", refunded = "REFUNDED", disputed = "DISPUTED", unknown

    init(from decoder: Decoder) throws {
        self = OrderStatus(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
    }

    var label: String {
        switch self {
        case .awaitingPayment: return "Waiting for payment"
        case .paid: return "Paid"
        case .completed: return "Done"
        case .cancelled: return "Cancelled"
        case .refunded: return "Refunded"
        case .disputed: return "Under review"
        case .unknown: return "Deal"
        }
    }
}

struct CheckoutSession: Decodable, Sendable, Equatable {
    let url: String
    let expiresAt: String?
}

struct Order: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let listingId: String
    let listing: ListingSummary
    let offerId: String
    let payer: Author
    let payee: Author
    let role: String
    let amountCents: Int
    let feeCents: Int
    let payoutCents: Int
    let currency: String
    let status: OrderStatus
    let cancelReason: String?
    let handoverCode: String?
    let paymentDueAt: String
    let paidAt: String?
    let approvalDeadlineAt: String?
    let completedAt: String?
    let cancelledAt: String?
    let refundedAt: String?
    let checkout: CheckoutSession?
    let createdAt: String

    private enum Keys: String, CodingKey { case id, listingId, listing, offerId, payer, payee, role, amountCents, feeCents, payoutCents, currency, status, cancelReason, handoverCode, paymentDueAt, paidAt, approvalDeadlineAt, completedAt, cancelledAt, refundedAt, checkout, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = try c.decode(String.self, forKey: .id)
        listingId = try c.decodeIfPresent(String.self, forKey: .listingId) ?? ""
        listing = try c.decode(ListingSummary.self, forKey: .listing)
        offerId = try c.decodeIfPresent(String.self, forKey: .offerId) ?? ""
        payer = try c.decode(Author.self, forKey: .payer)
        payee = try c.decode(Author.self, forKey: .payee)
        role = try c.decodeIfPresent(String.self, forKey: .role) ?? "payer"
        amountCents = try c.decodeIfPresent(Int.self, forKey: .amountCents) ?? 0
        feeCents = try c.decodeIfPresent(Int.self, forKey: .feeCents) ?? 0
        payoutCents = try c.decodeIfPresent(Int.self, forKey: .payoutCents) ?? (amountCents - feeCents)
        currency = try c.decodeIfPresent(String.self, forKey: .currency) ?? "eur"
        status = try c.decodeIfPresent(OrderStatus.self, forKey: .status) ?? .unknown
        cancelReason = try c.decodeIfPresent(String.self, forKey: .cancelReason)
        handoverCode = try c.decodeIfPresent(String.self, forKey: .handoverCode)
        paymentDueAt = try c.decodeIfPresent(String.self, forKey: .paymentDueAt) ?? ""
        paidAt = try c.decodeIfPresent(String.self, forKey: .paidAt)
        approvalDeadlineAt = try c.decodeIfPresent(String.self, forKey: .approvalDeadlineAt)
        completedAt = try c.decodeIfPresent(String.self, forKey: .completedAt)
        cancelledAt = try c.decodeIfPresent(String.self, forKey: .cancelledAt)
        refundedAt = try c.decodeIfPresent(String.self, forKey: .refundedAt)
        checkout = try c.decodeIfPresent(CheckoutSession.self, forKey: .checkout)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }

    var isPayer: Bool { role == "payer" }
    var counterpart: Author { isPayer ? payee : payer }
}

enum StripeStatus: Equatable, Sendable {
    case notSetUp, pending, ready

    var label: String {
        switch self {
        case .notSetUp: return "Not set up"
        case .pending: return "Almost there"
        case .ready: return "Ready"
        }
    }
}

struct StripeAccountStatus: Decodable, Sendable, Equatable {
    var connected = false
    var payoutsEnabled = false
    var detailsSubmitted = false
    var requirementsDue: [String] = []

    private enum Keys: String, CodingKey { case connected, payoutsEnabled, detailsSubmitted, requirementsDue }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        connected = try c.decodeIfPresent(Bool.self, forKey: .connected) ?? false
        payoutsEnabled = try c.decodeIfPresent(Bool.self, forKey: .payoutsEnabled) ?? false
        detailsSubmitted = try c.decodeIfPresent(Bool.self, forKey: .detailsSubmitted) ?? false
        requirementsDue = try c.decodeIfPresent([String].self, forKey: .requirementsDue) ?? []
    }

    var status: StripeStatus {
        if payoutsEnabled { return .ready }
        return connected ? .pending : .notSetUp
    }
}

struct StripeAccountLink: Decodable, Sendable {
    let url: String
    let expiresAt: String?
}

struct ApproveOrderRequest: Encodable, Sendable { let code: String }

struct MarketMeResponse: Decodable, Sendable {
    var payoutsEnabled = false
    var listings: [Listing] = []
    var offersMade: [Offer] = []
    var offersReceived: [Offer] = []
    var orders: [Order] = []

    private enum Keys: String, CodingKey { case payoutsEnabled, listings, offersMade, offersReceived, orders }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        payoutsEnabled = try c.decodeIfPresent(Bool.self, forKey: .payoutsEnabled) ?? false
        listings = try c.decodeIfPresent([Listing].self, forKey: .listings) ?? []
        offersMade = try c.decodeIfPresent([Offer].self, forKey: .offersMade) ?? []
        offersReceived = try c.decodeIfPresent([Offer].self, forKey: .offersReceived) ?? []
        orders = try c.decodeIfPresent([Order].self, forKey: .orders) ?? []
    }
}

struct CreateListingRequest: Encodable, Sendable {
    let kind: String
    let category: String
    let title: String
    let description: String
    let priceCents: Int
    let mediaIds: [String]
    let lat: Double
    let lng: Double
    let accuracy: Double
    let mocked: Bool?
}

/// Edits keep the kind and the location; photos are the full list in order (kept ids plus new upload ids).
struct UpdateListingRequest: Encodable, Sendable {
    let title: String
    let description: String
    let category: String
    let priceCents: Int
    let mediaIds: [String]
}

struct CreateOfferRequest: Encodable, Sendable {
    let amountCents: Int
    let note: String?
    let lat: Double
    let lng: Double
    let accuracy: Double
    let mocked: Bool?
}
