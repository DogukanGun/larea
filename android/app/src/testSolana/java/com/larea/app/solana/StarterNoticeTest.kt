package com.larea.app.solana

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The welcome card after connecting a wallet on devnet (backend starter funds, S8). */
class StarterNoticeTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `lists the funds in plain words`() {
        assertEquals(
            "Welcome gift: 0.05 SOL, 20 USDC and 20 SKR of devnet test funds are in your wallet. Check in somewhere and send a tip.",
            starterNotice(StarterSummary(sol = 0.05, usdc = 20.0, skr = 20.0), "devnet"),
        )
        assertEquals("Welcome gift: 1 SOL of localnet test funds are in your wallet. Check in somewhere and send a tip.", starterNotice(StarterSummary(sol = 1.0), "localnet"))
        assertEquals("", starterNotice(StarterSummary(), "devnet"))
    }

    @Test
    fun `link response without starter funds parses as before`() {
        val old = json.decodeFromString<WalletView>("""{"address":"A","linkedAt":"2026-10-05T00:00:00Z","cluster":"devnet"}""")
        assertNull(old.starter)
        val withStarter = json.decodeFromString<WalletView>("""{"address":"A","cluster":"devnet","starter":{"sol":0.05,"usdc":20,"skr":20}}""")
        assertEquals(20.0, withStarter.starter!!.usdc, 0.0)
        val mainnet = json.decodeFromString<WalletView>("""{"address":"A","cluster":"mainnet","starter":null}""")
        assertNull(mainnet.starter)
    }
}
