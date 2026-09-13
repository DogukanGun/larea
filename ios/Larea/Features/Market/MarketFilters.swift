import Foundation

struct MarketFilters: Equatable, Sendable {
    enum Sort: String, CaseIterable, Sendable {
        case distance, newest, price

        var label: String {
            switch self {
            case .distance: return "Nearest"
            case .newest: return "Newest"
            case .price: return "Price"
            }
        }
    }

    var kind: ListingKind? = nil
    var category: ListingCategory? = nil
    var minCents: Int? = nil
    var maxCents: Int? = nil
    var sort: Sort = .distance
    var query = ""

    var isActive: Bool { kind != nil || category != nil || minCents != nil || maxCents != nil || sort != .distance }

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let kind { items.append(URLQueryItem(name: "kind", value: kind.rawValue)) }
        if let category { items.append(URLQueryItem(name: "category", value: category.rawValue)) }
        if let minCents { items.append(URLQueryItem(name: "minPriceCents", value: String(minCents))) }
        if let maxCents { items.append(URLQueryItem(name: "maxPriceCents", value: String(maxCents))) }
        if sort != .distance { items.append(URLQueryItem(name: "sort", value: sort.rawValue)) }
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty { items.append(URLQueryItem(name: "q", value: String(q.prefix(60)))) }
        return items
    }
}

/// Mirrors the backend's listing rules so the form can explain problems before sending.
enum ListingValidation {
    static let titleMin = 3
    static let titleMax = 80
    static let descriptionMax = 1000

    static func validate(title: String, description: String, priceCents: Int?, config: MarketConfig) -> String? {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanTitle.count < titleMin { return "Give it a title of at least \(titleMin) characters." }
        if cleanTitle.count > titleMax { return "Keep the title under \(titleMax) characters." }
        if description.count > descriptionMax { return "Keep the description under \(descriptionMax) characters." }
        guard let priceCents else { return "Enter a price." }
        if priceCents < config.minPriceCents || priceCents > config.maxPriceCents {
            return "Prices must be between \(Money.format(cents: config.minPriceCents, currency: config.currency)) and \(Money.format(cents: config.maxPriceCents, currency: config.currency))."
        }
        return nil
    }
}
