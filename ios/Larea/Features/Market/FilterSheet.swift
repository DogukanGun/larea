import SwiftUI

struct FilterSheet: View {
    @State var draft: MarketFilters
    let onApply: (MarketFilters) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var minText = ""
    @State private var maxText = ""

    init(filters: MarketFilters, onApply: @escaping (MarketFilters) -> Void) {
        _draft = State(initialValue: filters)
        self.onApply = onApply
        _minText = State(initialValue: filters.minCents.map { String($0 / 100) } ?? "")
        _maxText = State(initialValue: filters.maxCents.map { String($0 / 100) } ?? "")
    }

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: Spacing.s)]

    var body: some View {
        NavigationStack {
            List {
                Section("What") {
                    HStack(spacing: Spacing.s) {
                        FilterChip(title: "All", selected: draft.kind == nil) { draft.kind = nil }
                        FilterChip(title: "Selling", symbol: "tag.fill", selected: draft.kind == .offer) { draft.kind = .offer }
                        FilterChip(title: "Help wanted", symbol: "hands.and.sparkles.fill", selected: draft.kind == .request) { draft.kind = .request }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
                Section("Category") {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: Spacing.s) {
                        FilterChip(title: "Any", selected: draft.category == nil) { draft.category = nil }
                        ForEach(ListingCategory.selectable, id: \.self) { category in
                            FilterChip(title: category.label, symbol: category.symbol, selected: draft.category == category) { draft.category = category }
                        }
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
                Section("Price") {
                    HStack {
                        TextField("Min", text: $minText).keyboardType(.decimalPad).accessibilityIdentifier("market.filter.min")
                        Text("–").foregroundStyle(.secondary)
                        TextField("Max", text: $maxText).keyboardType(.decimalPad).accessibilityIdentifier("market.filter.max")
                    }
                }
                Section("Sort") {
                    Picker("Sort", selection: $draft.sort) {
                        ForEach(MarketFilters.Sort.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset") {
                        draft = MarketFilters(query: draft.query)
                        minText = ""
                        maxText = ""
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Show results") {
                        draft.minCents = Money.parse(minText)
                        draft.maxCents = Money.parse(maxText)
                        onApply(draft)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("market.filter.apply")
                }
            }
        }
    }
}
