package com.larea.app.feature.market

import com.larea.app.core.network.ListingCategory
import com.larea.app.core.network.ListingKind
import com.larea.app.core.network.MarketConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors ios/LareaTests/ListingValidationTests.swift. */
class MarketFiltersTest {
    private val config = MarketConfig()

    @Test
    fun `a valid listing passes`() {
        assertNull(ListingValidation.validate("IKEA desk", "White", 2500, config))
    }

    @Test
    fun `problems in order`() {
        assertEquals("Give it a title of at least 3 characters.", ListingValidation.validate("ab", "", 2500, config))
        assertEquals("Keep the title under 80 characters.", ListingValidation.validate("t".repeat(81), "", 2500, config))
        assertEquals("Keep the description under 1000 characters.", ListingValidation.validate("Desk", "d".repeat(1001), 2500, config))
        assertEquals("Enter a price.", ListingValidation.validate("Desk", "", null, config))
        assertTrue(ListingValidation.validate("Desk", "", 50, config)!!.startsWith("Prices must be between"))
        assertTrue(ListingValidation.validate("Desk", "", 60_000, config)!!.startsWith("Prices must be between"))
    }

    @Test
    fun `filter query parameters`() {
        val empty = MarketFilters()
        assertTrue(empty.queryMap.isEmpty())
        assertFalse(empty.isActive)
        val filters = MarketFilters(kind = ListingKind.REQUEST, category = ListingCategory.HELP, minCents = 500, sort = MarketFilters.Sort.Price, query = "  sofa  ")
        assertEquals(mapOf("kind" to "REQUEST", "category" to "HELP", "minPriceCents" to "500", "sort" to "price", "q" to "sofa"), filters.queryMap)
        assertTrue(filters.isActive)
    }
}
