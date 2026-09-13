import Foundation

/// Prices are integer cents on the wire; shown in the user's locale.
enum Money {
    static func format(cents: Int, currency: String = "eur", locale: Locale = .current) -> String {
        let amount = Decimal(cents) / 100
        return amount.formatted(.currency(code: currency.uppercased()).precision(.fractionLength(cents % 100 == 0 ? 0 : 2)).locale(locale))
    }

    /// Plain digits for a price field ("12" or "12,50" in de_DE), without currency or grouping, so `parse` reads it back.
    static func editText(cents: Int, locale: Locale = .current) -> String {
        let amount = Decimal(cents) / 100
        return amount.formatted(.number.precision(.fractionLength(cents % 100 == 0 ? 0 : 2)).grouping(.never).locale(locale))
    }

    /// Accepts "12", "12,50", "12.50", "€ 7"; nil when empty, negative or unparseable.
    static func parse(_ text: String, locale: Locale = .current) -> Int? {
        var cleaned = text.replacingOccurrences(of: "[^0-9.,]", with: "", options: .regularExpression)
        guard !cleaned.isEmpty else { return nil }
        // The last separator is the decimal one; anything before it is grouping.
        if let last = cleaned.lastIndex(where: { $0 == "," || $0 == "." }) {
            let fraction = cleaned[cleaned.index(after: last)...]
            let whole = cleaned[..<last].replacingOccurrences(of: "[.,]", with: "", options: .regularExpression)
            guard fraction.count <= 2 else { return nil }
            cleaned = whole + "." + fraction
        }
        guard let value = Double(cleaned), value > 0, value <= 1_000_000 else { return nil }
        return Int((value * 100).rounded())
    }
}
