package com.larea.app.core.format

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale

/** Mirrors ios/LareaTests/PriceFormattingTests.swift and ValidationTests.swift. */
class FormattingTest {
    private fun plain(text: String) = text.replace(' ', ' ').replace(' ', ' ')
    private val de = Locale.GERMANY
    private val us = Locale.US

    @Test
    fun `edit text round trips`() {
        assertEquals("12,50", Money.editText(1250, de))
        assertEquals("50", Money.editText(5000, de))
        assertEquals("1234.56", Money.editText(123_456, us))
        assertEquals(1250, Money.parse(Money.editText(1250, de)))
        assertEquals(123_456, Money.parse(Money.editText(123_456, us)))
    }

    @Test
    fun `formats in the given locale`() {
        assertEquals("12,50 €", plain(Money.format(1250, locale = de)))
        assertEquals("50 €", plain(Money.format(5000, locale = de)))
        assertEquals("€12.50", plain(Money.format(1250, locale = us)))
    }

    @Test
    fun `parses what people type`() {
        assertEquals(1200, Money.parse("12"))
        assertEquals(1250, Money.parse("12,50"))
        assertEquals(1250, Money.parse("12.50"))
        assertEquals(700, Money.parse("€ 7"))
        assertEquals(123_456, Money.parse("1.234,56"))
        assertNull(Money.parse("abc"))
        assertNull(Money.parse("0"))
        assertNull(Money.parse(""))
        assertNull(Money.parse("1,234"))
    }

    @Test
    fun `email rule`() {
        assertNull(Validation.email("anna@example.com"))
        assertNotNull(Validation.email(""))
        assertNotNull(Validation.email("nope"))
        assertNotNull(Validation.email("a@b"))
    }

    @Test
    fun `password rule`() {
        assertNull(Validation.password("correct-horse-battery"))
        assertNotNull(Validation.password("short"))
        assertNotNull(Validation.password(""))
    }

    @Test
    fun `display name matches backend rule`() {
        assertNull(Validation.displayName("anna_k"))
        assertNull(Validation.displayName("Anna K."))
        assertNull(Validation.displayName("Zoë 23"))
        assertNotNull(Validation.displayName("ab"))
        assertNotNull(Validation.displayName("-anna"))
        assertNull(Validation.displayName(" anna "))
        assertNotNull(Validation.displayName("anna!"))
        assertNotNull(Validation.displayName("a".repeat(25)))
    }

    @Test
    fun `relative times`() {
        val now = 1_800_000_000_000L
        assertEquals("just now", Dates.relative("2027-01-15T08:00:00Z", Dates.parseMillis("2027-01-15T08:00:30Z")!!))
        assertEquals("5 min ago", Dates.relative("2027-01-15T08:00:00Z", Dates.parseMillis("2027-01-15T08:05:00Z")!!))
        assertEquals("in 2 h", Dates.relative("2027-01-15T10:00:00Z", Dates.parseMillis("2027-01-15T08:00:00Z")!!))
        assertEquals("", Dates.relative(null, now))
    }

    @Test
    fun `formats USDC prices without an ISO currency`() {
        assertEquals("12.50 USDC", Money.format(1250, "usdc", Locale.US))
        assertEquals("15 USDC", Money.format(1500, "usdc", Locale.GERMANY))
    }
}
