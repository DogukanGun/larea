package com.larea.app.core.format

import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Prices are integer cents on the wire; shown in the user's locale. */
object Money {
    fun format(cents: Int, currency: String = "eur", locale: Locale = Locale.getDefault()): String {
        val formatter = NumberFormat.getCurrencyInstance(locale)
        runCatching { formatter.currency = Currency.getInstance(currency.uppercase(Locale.ROOT)) }
        val digits = if (cents % 100 == 0) 0 else 2
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.format(BigDecimal.valueOf(cents.toLong(), 2))
    }

    /** Plain digits for a price field ("12" or "12,50" in de_DE), without currency or grouping, so `parse` reads it back. */
    fun editText(cents: Int, locale: Locale = Locale.getDefault()): String {
        val formatter = NumberFormat.getNumberInstance(locale)
        formatter.isGroupingUsed = false
        val digits = if (cents % 100 == 0) 0 else 2
        formatter.minimumFractionDigits = digits
        formatter.maximumFractionDigits = digits
        return formatter.format(BigDecimal.valueOf(cents.toLong(), 2))
    }

    /** Accepts "12", "12,50", "12.50", "€ 7"; null when empty, negative or unparseable. */
    fun parse(text: String): Int? {
        var cleaned = text.replace(Regex("[^0-9.,]"), "")
        if (cleaned.isEmpty()) return null
        // The last separator is the decimal one; anything before it is grouping.
        val last = cleaned.indexOfLast { it == ',' || it == '.' }
        if (last >= 0) {
            val fraction = cleaned.substring(last + 1)
            val whole = cleaned.substring(0, last).replace(Regex("[.,]"), "")
            if (fraction.length > 2) return null
            cleaned = "$whole.$fraction"
        }
        val value = cleaned.toDoubleOrNull() ?: return null
        if (value <= 0 || value > 1_000_000) return null
        return Math.round(value * 100).toInt()
    }
}
