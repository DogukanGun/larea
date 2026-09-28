package com.larea.app.feature.market

import com.larea.app.core.format.Money
import com.larea.app.core.network.ListingCategory
import com.larea.app.core.network.ListingKind
import com.larea.app.core.network.MarketConfig

data class MarketFilters(
    val kind: ListingKind? = null,
    val category: ListingCategory? = null,
    val minCents: Int? = null,
    val maxCents: Int? = null,
    val sort: Sort = Sort.Distance,
    val query: String = "",
) {
    enum class Sort(val raw: String, val label: String) { Distance("distance", "Nearest"), Newest("newest", "Newest"), Price("price", "Price") }

    val isActive: Boolean get() = kind != null || category != null || minCents != null || maxCents != null || sort != Sort.Distance

    /** Query parameters for `GET market/listings` (same rules as iOS `queryItems`). */
    val queryMap: Map<String, String>
        get() = buildMap {
            kind?.let { put("kind", it.raw) }
            category?.let { put("category", it.raw) }
            minCents?.let { put("minPriceCents", it.toString()) }
            maxCents?.let { put("maxPriceCents", it.toString()) }
            if (sort != Sort.Distance) put("sort", sort.raw)
            val q = query.trim()
            if (q.isNotEmpty()) put("q", q.take(60))
        }
}

/** Mirrors the backend's listing rules so the form can explain problems before sending. */
object ListingValidation {
    const val TITLE_MIN = 3
    const val TITLE_MAX = 80
    const val DESCRIPTION_MAX = 1000

    fun validate(title: String, description: String, priceCents: Int?, config: MarketConfig): String? {
        val cleanTitle = title.trim()
        return when {
            cleanTitle.length < TITLE_MIN -> "Give it a title of at least $TITLE_MIN characters."
            cleanTitle.length > TITLE_MAX -> "Keep the title under $TITLE_MAX characters."
            description.length > DESCRIPTION_MAX -> "Keep the description under $DESCRIPTION_MAX characters."
            priceCents == null -> "Enter a price."
            priceCents < config.minPriceCents || priceCents > config.maxPriceCents ->
                "Prices must be between ${Money.format(config.minPriceCents, config.currency)} and ${Money.format(config.maxPriceCents, config.currency)}."
            else -> null
        }
    }
}
