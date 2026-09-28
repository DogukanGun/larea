package com.larea.app.ui.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors ios/LareaTests/AppRouterTests.swift. */
class AppRouterTest {
    @Test
    fun `parses checkout returns`() {
        assertEquals(DeepLink.OrderCheckout("abc-123", true), DeepLink.parse("larea://market/order/abc-123?checkout=success"))
        assertEquals(DeepLink.OrderCheckout("abc-123", false), DeepLink.parse("larea://market/order/abc-123?checkout=cancel"))
        assertEquals(DeepLink.StripeReturn, DeepLink.parse("larea://market/stripe/return?status=complete"))
    }

    @Test
    fun `rejects foreign links`() {
        assertNull(DeepLink.parse("https://larea.dogukangundogan.com/market/order/1"))
        assertNull(DeepLink.parse("larea://chat/1"))
        assertNull(DeepLink.parse("larea://market/order"))
        assertNull(DeepLink.parse(null))
    }

    @Test
    fun `deep links wait for the main screen, then switch tabs`() {
        val router = AppRouter()
        val requests = mutableListOf<NavRequest>()
        router.handle("larea://market/order/o1?checkout=success")
        assertEquals(AppTab.Nearby, router.tab.value)
        router.mainShown()
        assertEquals(AppTab.Deals, router.tab.value)
        assertEquals("o1", router.checkoutResult.value?.orderId)
        assertEquals(true, router.checkoutResult.value?.success)
        requests += router.requests.replayCache
        router.handle("larea://market/stripe/return")
        assertEquals(AppTab.Profile, router.tab.value)
        assertEquals(1, router.stripeReturns.value)

        router.reset()
        assertEquals(AppTab.Nearby, router.tab.value)
        assertNull(router.checkoutResult.value)
        assertTrue(requests.isEmpty()) // requests are events, not replayed state
    }
}
