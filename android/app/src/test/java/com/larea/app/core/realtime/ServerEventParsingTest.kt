package com.larea.app.core.realtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEventParsingTest {
    private val json = com.larea.app.core.network.LareaJson

    private fun parse(text: String): ServerEvent = json.decodeFromString(ServerEvent.serializer(), text)

    @Test
    fun `parses every event type from the protocol document`() {
        val ack = parse("""{"type":"ack","reqId":"r1","ok":true,"data":{"state":"eligible","removed":false}}""") as ServerEvent.Ack
        assertEquals("r1", ack.reqId)
        assertTrue(ack.ok)
        assertEquals("eligible", ack.data?.get("state")?.jsonPrimitive?.content)

        val message = parse(
            """{"type":"message","message":{"id":"m1","venueId":"v1","author":{"id":"u1","displayName":"anna_k"},"text":"hi","status":"APPROVED","createdAt":"2026-09-06T21:00:00.000Z"}}""",
        ) as ServerEvent.Message
        assertEquals("anna_k", message.message.author.displayName)

        val hidden = parse("""{"type":"message_hidden","venueId":"v1","messageId":"m1"}""") as ServerEvent.MessageHidden
        assertEquals("m1", hidden.messageId)

        val removed = parse("""{"type":"removed","venueId":"v1","reason":"out_of_range","message":"You're no longer near this location. You've been removed from the chat."}""") as ServerEvent.Removed
        assertEquals("out_of_range", removed.reason)

        val enforcement = parse("""{"type":"enforcement","kind":"mute","until":"2026-09-07T00:00:00.000Z","message":"muted"}""") as ServerEvent.Enforcement
        assertEquals("mute", enforcement.kind)

        val presence = parse("""{"type":"presence","venueId":"v1","count":7}""") as ServerEvent.Presence
        assertEquals(7, presence.count)

        val poll = parse("""{"type":"poll_update","venueId":"v1","messageId":"m9","poll":{"id":"p1","question":"Pizza?","options":[{"id":"o1","text":"Yes","votes":2},{"id":"o2","text":"No","votes":1}],"totalVotes":3,"closed":false,"closesAt":null}}""") as ServerEvent.PollUpdate
        assertEquals("m9", poll.messageId)
        assertEquals(listOf(2, 1), poll.poll.options.map { it.votes })

        val market = parse("""{"type":"market_update","kind":"offer_received","listingId":"l1","offerId":"o1"}""") as ServerEvent.MarketUpdate
        assertEquals("offer_received", market.kind)
        assertEquals("o1", market.offerId)
        assertEquals(null, market.orderId)

        assertTrue(parse("""{"type":"pong","reqId":"r2"}""") is ServerEvent.Pong)
        val error = parse("""{"type":"error","reqId":"r3","code":"BAD_MESSAGE","message":"x"}""") as ServerEvent.Error
        assertEquals("BAD_MESSAGE", error.code)
    }

    @Test
    fun `ignores unknown fields so the protocol can grow`() {
        val presence = parse("""{"type":"presence","venueId":"v1","count":1,"extra":{"nested":true}}""") as ServerEvent.Presence
        assertEquals(1, presence.count)
    }
}
