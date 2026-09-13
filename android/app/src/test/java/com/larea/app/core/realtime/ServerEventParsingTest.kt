package com.larea.app.core.realtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerEventParsingTest {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; classDiscriminator = "type" }

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
