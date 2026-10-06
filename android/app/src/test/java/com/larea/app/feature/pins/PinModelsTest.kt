package com.larea.app.feature.pins

import com.larea.app.core.network.Features
import com.larea.app.core.network.LareaJson
import com.larea.app.core.network.MessagePin
import com.larea.app.core.network.PinQuote
import com.larea.app.core.network.PinTier
import com.larea.app.core.realtime.ServerEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class PinModelsTest {
    private val json = LareaJson

    @Test
    fun `parses pin events`() {
        val message = json.decodeFromString(
            ServerEvent.serializer(),
            """{"type":"pin_message","message":{"id":"m1","pinId":"p1","author":{"id":"u1","displayName":"anna_k"},"text":"I saw the cat","status":"APPROVED","createdAt":"2026-10-05T12:00:00.000Z"}}""",
        ) as ServerEvent.PinMessageEvent
        assertEquals("p1", message.message.pinId)
        val hidden = json.decodeFromString(ServerEvent.serializer(), """{"type":"pin_message_hidden","pinId":"p1","messageId":"m1"}""") as ServerEvent.PinMessageHidden
        assertEquals("m1", hidden.messageId)
        val updated = json.decodeFromString(ServerEvent.serializer(), """{"type":"pin_updated","pinId":"p1","text":"Moved to 8pm","editedAt":"2026-10-05T12:00:00.000Z"}""") as ServerEvent.PinUpdated
        assertEquals("Moved to 8pm", updated.text)
        val closed = json.decodeFromString(ServerEvent.serializer(), """{"type":"pin_closed","pinId":"p1","reason":"expired","message":"This pin has expired."}""") as ServerEvent.PinClosed
        assertEquals("expired", closed.reason)
    }

    @Test
    fun `parses a quote and knows the tier's product`() {
        val quote = json.decodeFromString(
            PinQuote.serializer(),
            """{"pin":{"id":"p1","text":"Concert tonight","tier":"COUNTRY","status":"PENDING_PAYMENT","lat":48.1,"lng":11.5,"owner":{"id":"u1","displayName":"anna_k"},"mine":true,"createdAt":"2026-10-05T12:00:00.000Z","expiresAt":null,"editedAt":null,"messageCount":0},"tier":"COUNTRY","productId":"com.dogukangundogan.larea.pin.country","priceUsd":"29.99","durationHours":72,"buyerCity":"Munich","targetCity":"Hamburg"}""",
        )
        assertEquals(PinTier.COUNTRY, quote.pinTier)
        assertEquals(PinTier.COUNTRY.productId, quote.productId)
        assertEquals("3 days", quote.durationText)
        assertFalse(quote.pin.isLive)
        assertTrue(quote.pin.canChat) // the owner always can
    }

    @Test
    fun `only people near a pin can chat`() {
        val future = Instant.now().plusSeconds(3600).toString()
        val pin = json.decodeFromString(
            MessagePin.serializer(),
            """{"id":"p1","text":"hi","tier":"NEARBY","status":"ACTIVE","lat":1,"lng":2,"owner":{"id":"u1","displayName":"a"},"mine":false,"expiresAt":"$future","distanceM":1260,"eligible":false}""",
        )
        assertTrue(pin.isLive)
        assertFalse(pin.canChat)
        assertEquals("1.3 km", pin.distanceText)
    }

    @Test
    fun `features carry the pins flag`() {
        assertTrue(json.decodeFromString(Features.serializer(), """{"pins":true}""").pins)
        assertFalse(json.decodeFromString(Features.serializer(), "{}").pins)
    }
}
