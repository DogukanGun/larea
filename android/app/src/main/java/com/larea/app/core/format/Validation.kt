package com.larea.app.core.format

/** Client-side validation mirroring the backend rules; returns a message or null when valid. */
object Validation {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")
    private val namePattern = Regex("^[\\p{L}\\p{N}_.][\\p{L}\\p{N}_. ]{1,22}[\\p{L}\\p{N}_.]$")

    fun email(value: String): String? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return "Enter your email address."
        return if (emailPattern.matches(trimmed)) null else "That doesn't look like an email address."
    }

    fun password(value: String): String? = when {
        value.isEmpty() -> "Choose a password."
        value.codePointCount(0, value.length) < 10 -> "Use at least 10 characters."
        value.codePointCount(0, value.length) > 128 -> "Use at most 128 characters."
        else -> null
    }

    fun displayName(value: String): String? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return "Pick a display name."
        return if (namePattern.matches(trimmed)) null else "3–24 characters: letters, numbers, spaces, underscores or dots."
    }
}
