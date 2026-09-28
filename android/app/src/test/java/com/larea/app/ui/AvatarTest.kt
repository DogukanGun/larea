package com.larea.app.ui

import com.larea.app.ui.components.AvatarPalette
import com.larea.app.ui.theme.stableHash
import org.junit.Assert.assertEquals
import org.junit.Test

/** Mirrors ios/LareaTests/AvatarTests.swift, including the hash value so both apps colour a user alike. */
class AvatarTest {
    @Test
    fun `colour is stable for the same seed`() {
        assertEquals(AvatarPalette.colorIndex("user-1"), AvatarPalette.colorIndex("user-1"))
        assertEquals(stableHash("larea"), stableHash("larea"))
        // FNV-1a 64 of "a" is 0xaf63dc4c8601ec8c on every platform.
        assertEquals(0xaf63dc4c8601ec8cUL, stableHash("a"))
    }

    @Test
    fun `colours spread across the palette`() {
        val indices = (0 until 200).map { AvatarPalette.colorIndex("user-$it") }.toSet()
        assertEquals(AvatarPalette.colors.size, indices.size)
    }

    @Test
    fun `initials`() {
        assertEquals("AK", AvatarPalette.initials("anna_k"))
        assertEquals("B", AvatarPalette.initials("Ben"))
        assertEquals("ML", AvatarPalette.initials("mia.lou.x"))
        assertEquals("?", AvatarPalette.initials(""))
    }
}
