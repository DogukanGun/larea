package com.larea.app.core.format

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class Base58Test {
    @Test
    fun `round trips Solana keys, including leading zero bytes`() {
        val systemProgram = ByteArray(32)
        assertEquals("11111111111111111111111111111111", Base58.encode(systemProgram))
        assertArrayEquals(systemProgram, Base58.decode("11111111111111111111111111111111"))
        val key = Base58.decode("6GdtfRGsC59mU8kpXSfZv9A4yuMZgHY8mjn1dS5gi1eE")
        assertEquals(32, key.size)
        assertEquals("6GdtfRGsC59mU8kpXSfZv9A4yuMZgHY8mjn1dS5gi1eE", Base58.encode(key))
    }

    @Test
    fun `short form`() {
        assertEquals("6GdtfR…i1eE", Base58.short("6GdtfRGsC59mU8kpXSfZv9A4yuMZgHY8mjn1dS5gi1eE"))
    }
}
