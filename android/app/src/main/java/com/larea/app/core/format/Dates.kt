package com.larea.app.core.format

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.abs

/** ISO-8601 timestamps from the API and the ways the app shows them. */
object Dates {
    fun parseMillis(iso: String?): Long? =
        iso?.takeIf { it.isNotBlank() }?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    fun isFuture(iso: String?, nowMs: Long = System.currentTimeMillis()): Boolean = (parseMillis(iso) ?: 0L) > nowMs

    /** "14:05" in the user's locale. */
    fun time(iso: String?, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
        val ms = parseMillis(iso) ?: return ""
        return DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(Instant.ofEpochMilli(ms).atZone(zone))
    }

    /** "14:05" today, "tomorrow at 14:05", otherwise "Wed 14:05" (iOS `lareaShort`). */
    fun short(iso: String?, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault(), nowMs: Long = System.currentTimeMillis()): String {
        val ms = parseMillis(iso) ?: return ""
        val time = Instant.ofEpochMilli(ms).atZone(zone)
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val clock = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(time)
        return when (time.toLocalDate()) {
            today -> clock
            today.plusDays(1) -> "tomorrow at $clock"
            else -> DateTimeFormatter.ofPattern("EEE", locale).format(time) + " " + clock
        }
    }

    /** "28 Sep 2026, 14:05" in the user's locale. */
    fun dateTime(iso: String?, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String {
        val ms = parseMillis(iso) ?: return ""
        return DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale)
            .format(Instant.ofEpochMilli(ms).atZone(zone))
    }

    /** "5 min ago", "in 2 h", "3 days ago": short relative time like iOS's abbreviated RelativeDateTimeFormatter. */
    fun relative(iso: String?, nowMs: Long = System.currentTimeMillis()): String {
        val ms = parseMillis(iso) ?: return ""
        val diffSec = (ms - nowMs) / 1000
        val past = diffSec < 0
        val s = abs(diffSec)
        val text = when {
            // Within a minute either way reads "just now": device and server clocks are rarely in sync.
            s < 60 -> return "just now"
            s < 3600 -> "${s / 60} min"
            s < 86_400 -> "${s / 3600} h"
            s < 86_400 * 7 -> (s / 86_400).let { "$it ${if (it == 1L) "day" else "days"}" }
            else -> (s / (86_400 * 7)).let { "$it ${if (it == 1L) "wk" else "wks"}" }
        }
        return if (past) "$text ago" else "in $text"
    }
}

/** "80 m" / "1.2 km" */
fun distanceText(meters: Int): String =
    if (meters < 1000) "$meters m" else String.format(Locale.US, "%.1f km", meters / 1000.0)
