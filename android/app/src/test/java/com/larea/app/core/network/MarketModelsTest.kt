package com.larea.app.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors ios/LareaTests/MarketModelsTests.swift. */
class MarketModelsTest {
    private inline fun <reified T> decode(text: String): T = LareaJson.decodeFromString(text)

    private val listingJson = """{"id":"l1","kind":"OFFER","category":"FURNITURE","title":"Desk","description":"White","priceCents":2500,"currency":"eur","status":"ACTIVE","owner":{"id":"u1","displayName":"anna"},"mine":false,"images":[{"url":"/media/a.jpg","thumbUrl":"/media/a_thumb.jpg","width":1600,"height":1200}],"location":{"lat":48.14,"lng":11.57,"approximate":true},"distanceM":450,"createdAt":"2026-09-13T10:00:00.000Z","expiresAt":"2026-10-13T10:00:00.000Z","myOffer":null}"""

    @Test
    fun `listing decodes with defaults and unknown enums`() {
        val listing = decode<Listing>(listingJson)
        assertEquals(ListingKind.OFFER, listing.kind)
        assertEquals(ListingCategory.FURNITURE, listing.category)
        assertEquals("450 m", listing.distanceText)
        assertNull(listing.myOffer)
        assertNull(listing.offers)
        assertEquals("/media/a_thumb.jpg", listing.images.first().thumbUrl)

        val weird = decode<Listing>(listingJson.replace("\"FURNITURE\"", "\"SPACESHIPS\"").replace("\"ACTIVE\"", "\"FROZEN\""))
        assertEquals(ListingCategory.UNKNOWN, weird.category)
        assertEquals(ListingStatus.UNKNOWN, weird.status)
    }

    @Test
    fun `offer and market me decode`() {
        val me = decode<MarketMeResponse>("""{"payoutsEnabled":false,"listings":[],"offersMade":[{"id":"o1","listingId":"l1","listing":{"id":"l1","title":"Desk","kind":"OFFER","priceCents":2500,"thumbUrl":null,"status":"ACTIVE"},"offerer":{"id":"u2","displayName":"ben"},"amountCents":2000,"note":null,"status":"PENDING","expiresAt":"2026-09-16T10:00:00.000Z","respondedAt":null,"orderId":null,"createdAt":"2026-09-13T10:00:00.000Z"}],"offersReceived":[]}""")
        assertEquals(OfferStatus.PENDING, me.offersMade.first().status)
        assertEquals("Desk", me.offersMade.first().listing.title)
        assertNull(me.offersMade.first().listing.thumbnailUrl)
        assertEquals(emptyList<Listing>(), decode<MarketMeResponse>("{}").listings)
    }

    @Test
    fun `market config defaults`() {
        val config = decode<MarketConfig>("""{"payments":true,"maxPriceCents":20000}""")
        assertTrue(config.payments)
        assertEquals(20000, config.maxPriceCents)
        assertEquals(2000.0, config.radiusM, 0.0)
    }

    @Test
    fun `order and stripe status decode`() {
        val json = """{"id":"o1","listingId":"l1","listing":{"id":"l1","title":"Desk","kind":"OFFER","priceCents":2500,"thumbUrl":null,"status":"RESERVED"},"offerId":"of1","payer":{"id":"u2","displayName":"ben"},"payee":{"id":"u1","displayName":"anna"},"role":"payee","amountCents":2300,"feeCents":230,"payoutCents":2070,"currency":"eur","status":"PAID","cancelReason":null,"handoverCode":null,"paymentDueAt":"2026-09-14T10:00:00.000Z","paidAt":"2026-09-13T11:00:00.000Z","approvalDeadlineAt":"2026-09-27T11:00:00.000Z","completedAt":null,"cancelledAt":null,"refundedAt":null,"checkout":null,"createdAt":"2026-09-13T10:00:00.000Z"}"""
        val order = decode<Order>(json)
        assertEquals(OrderStatus.PAID, order.status)
        assertFalse(order.isPayer)
        assertEquals("ben", order.counterpart.displayName)
        assertEquals(2070, order.payoutCents)
        assertEquals(OrderStatus.UNKNOWN, decode<Order>(json.replace("\"PAID\"", "\"FROZEN\"")).status)

        assertEquals(StripeStatus.READY, decode<StripeAccountStatus>("""{"connected":true,"payoutsEnabled":true,"detailsSubmitted":true,"requirementsDue":[]}""").status)
        assertEquals(StripeStatus.PENDING, decode<StripeAccountStatus>("""{"connected":true,"payoutsEnabled":false,"requirementsDue":["external_account"]}""").status)
        assertEquals(StripeStatus.NOT_SET_UP, decode<StripeAccountStatus>("{}").status)
    }

    @Test
    fun `media urls resolve against the api and loopback hosts follow it`() {
        assertEquals("http://10.0.2.2:3000/media/a.jpg", MediaUrls.resolve("/media/a.jpg", "http://10.0.2.2:3000/"))
        assertEquals("http://10.0.2.2:3000/media/a.jpg", MediaUrls.resolve("http://localhost:3000/media/a.jpg", "http://10.0.2.2:3000/"))
        assertEquals("https://larea.dogukangundogan.com/media/a.jpg", MediaUrls.resolve("https://larea.dogukangundogan.com/media/a.jpg", "https://larea.dogukangundogan.com/"))
    }
}
