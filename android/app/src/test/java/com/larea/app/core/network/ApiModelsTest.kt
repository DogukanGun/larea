package com.larea.app.core.network

import com.larea.app.core.realtime.reconnectDelayMs
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors ios/LareaTests/APIModelsTests.swift. */
class ApiModelsTest {
    private inline fun <reified T> decode(text: String): T = LareaJson.decodeFromString(text)

    @Test
    fun `decodes me and join result`() {
        val me = decode<MeView>("""{"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"ageVerifiedAt":null,"mutedUntil":null,"suspendedAt":null,"createdAt":"2026-09-06T21:00:00.000Z","activeMembership":{"venueId":"v1","venueName":"Main Square","joinedAt":"2026-09-06T21:00:00.000Z"}}""")
        assertTrue(me.ageVerified)
        assertEquals("Main Square", me.activeMembership?.venueName)

        val join = decode<JoinResult>("""{"membership":{"id":"m","venueId":"v1","joinedAt":"x"},"venue":{"id":"v1","slug":"main-square","name":"Main Square","label":"General Chat"},"timing":{"heartbeatIntervalSec":25,"staleAfterSec":120,"weakGpsGraceSec":300},"memberCount":3}""")
        assertEquals(25, join.timing.heartbeatIntervalSec)
        assertEquals(3, join.memberCount)
    }

    @Test
    fun `reconnect delay grows and caps`() {
        assertEquals(1_000L, reconnectDelayMs(1))
        assertEquals(2_000L, reconnectDelayMs(2))
        assertEquals(4_000L, reconnectDelayMs(3))
        assertEquals(30_000L, reconnectDelayMs(10))
    }

    @Test
    fun `decodes nearby places and degrades unknown categories`() {
        val response = decode<NearbyResponse>("""{"venues":[{"id":"v1","slug":"osm-node-1","name":"Bezirkszentralbibliothek","label":"General Chat","category":"library","address":"Brunnenstraße 181","lat":52.5316,"lng":13.3987,"distanceM":80,"eligible":true,"memberCount":2},{"id":"v2","slug":"x","name":"Odd place","label":"General Chat","category":"spaceport","lat":1,"lng":2,"eligible":false,"memberCount":0}],"degraded":false,"attribution":"Place data © OpenStreetMap contributors"}""")
        assertEquals(2, response.venues.size)
        assertEquals(VenueCategory.LIBRARY, response.venues[0].category)
        assertEquals("80 m", response.venues[0].distanceText)
        assertEquals(VenueCategory.UNKNOWN, response.venues[1].category)
        assertEquals(0, response.venues[1].distanceM)
        assertEquals("Place data © OpenStreetMap contributors", response.attribution)
        assertFalse(response.degraded)
        assertFalse(response.pending)
    }

    @Test
    fun `distance text switches to kilometres`() {
        val venue = NearbyVenue("v", "s", "n", "l", "park", null, 0.0, 0.0, 1260, false, 0)
        assertEquals("1.3 km", venue.distanceText)
    }

    @Test
    fun `features default to off when absent`() {
        val legacy = decode<MeView>("""{"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"createdAt":"2026-09-13T10:00:00.000Z","activeMembership":null}""")
        assertNull(legacy.features)
        assertEquals(Features.None, legacy.capabilities)
        val current = decode<MeView>("""{"id":"u1","email":"a@b.c","displayName":"anna","role":"USER","ageVerified":true,"createdAt":"2026-09-13T10:00:00.000Z","features":{"market":true,"payments":false}}""")
        assertEquals(Features(images = false, polls = false, market = true, payments = false), current.capabilities)
    }

    @Test
    fun `members response decodes`() {
        val response = decode<MembersResponse>("""{"members":[{"id":"u1","displayName":"anna"},{"id":"u2","displayName":"ben"}],"count":3}""")
        assertEquals(listOf("anna", "ben"), response.members.map { it.displayName })
        assertEquals(3, response.count)
    }

    @Test
    fun `image messages decode and legacy messages default to text`() {
        val message = decode<ChatMessage>("""{"id":"m1","venueId":"v1","author":{"id":"u1","displayName":"anna"},"kind":"IMAGE","text":"lunch","caption":"lunch","image":{"url":"https://x/media/a.jpg","thumbUrl":"https://x/media/a_thumb.jpg","width":1600,"height":1200},"status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}""")
        assertEquals(MessageKind.IMAGE, message.kind)
        assertEquals("lunch", message.caption)
        assertEquals(1600, message.image?.width)
        assertEquals(4f / 3f, message.image!!.aspectRatio, 0.001f)
        assertEquals("https://x/media/a.jpg", message.image!!.key)

        val old = decode<ChatMessage>("""{"id":"m2","venueId":"v1","author":{"id":"u1","displayName":"anna"},"text":"hi","status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}""")
        assertEquals(MessageKind.TEXT, old.kind)
        assertNull(old.image)

        val future = decode<ChatMessage>("""{"id":"m3","venueId":"v1","author":{"id":"u1","displayName":"anna"},"kind":"HOLOGRAM","text":"[Hologram]","status":"APPROVED","createdAt":"2026-09-13T10:00:00.000Z"}""")
        assertEquals(MessageKind.UNKNOWN, future.kind)
    }

    @Test
    fun `send requests omit absent fields`() {
        val text = LareaJson.parseToJsonElement(LareaJson.encodeToString(SendMessageRequest.serializer(), SendMessageRequest.text("hi", "k1"))).jsonObject
        assertEquals(setOf("text", "clientKey"), text.keys)
        val image = LareaJson.parseToJsonElement(LareaJson.encodeToString(SendMessageRequest.serializer(), SendMessageRequest.image("abc", "", "k2"))).jsonObject
        assertEquals(setOf("kind", "mediaId", "clientKey"), image.keys)
        assertEquals("IMAGE", image["kind"]?.jsonPrimitive?.content)
    }

    @Test
    fun `poll percentages, closing and merge keep my vote`() {
        val poll = decode<PollView>("""{"id":"p1","question":"Pizza?","options":[{"id":"o1","text":"Yes","votes":2},{"id":"o2","text":"No","votes":1}],"myOptionId":"o1","closed":false,"closesAt":"2020-01-01T00:00:00.000Z"}""")
        assertEquals(3, poll.totalVotes)
        assertEquals(67, poll.percent(poll.options[0]))
        assertTrue(poll.isClosed())
        val update = poll.copy(myOptionId = null, totalVotes = 4)
        assertEquals("o1", poll.merging(update).myOptionId)
    }

    @Test
    fun `decodes loyalty level and room, and sends the room only when set`() {
        val message = decode<ChatMessage>("""{"id":"m1","venueId":"v1","author":{"id":"u1","displayName":"anna"},"kind":"TEXT","text":"hi","status":"APPROVED","createdAt":"x","room":"REGULARS","authorLevel":3}""")
        assertEquals(3, message.authorLevel)
        assertEquals("REGULARS", message.room)
        val plain = decode<ChatMessage>("""{"id":"m2","venueId":"v1","author":{"id":"u1","displayName":"anna"},"text":"hi","createdAt":"x"}""")
        assertEquals(0, plain.authorLevel)
        assertNull(plain.room)

        val main = LareaJson.encodeToString(SendMessageRequest.serializer(), SendMessageRequest.text("hi", "k1234567"))
        assertFalse(main.contains("room"))
        val regulars = LareaJson.encodeToString(SendMessageRequest.serializer(), SendMessageRequest.text("hi", "k1234567", "REGULARS"))
        assertTrue(regulars.contains("\"room\":\"REGULARS\""))
    }
}
