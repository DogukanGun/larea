package com.larea.app.core.realtime

import com.larea.app.core.auth.SessionSource
import com.larea.app.core.auth.TokenRefreshing
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class RealtimeClientTest {
    private lateinit var server: MockWebServer
    private val okhttp = OkHttpClient()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        // Drop client-side connections first so the server can shut down cleanly.
        okhttp.dispatcher.executorService.shutdownNow()
        okhttp.connectionPool.evictAll()
        server.close()
    }

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; classDiscriminator = "type" }

    private class FakeSession(var token: String?) : SessionSource, TokenRefreshing {
        val refreshes = AtomicInteger()
        override suspend fun accessToken(): String? = token
        override suspend fun refresh(staleAccessToken: String?): String? {
            refreshes.incrementAndGet()
            token = "fresh-token"
            return token
        }
    }

    /** A server that authenticates the upgrade and answers join/heartbeat with acks. */
    private fun enqueueSocket(expectedToken: String, onOpen: (WebSocket) -> Unit = {}) {
        server.enqueue(
            MockResponse.Builder().webSocketUpgrade(object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) = onOpen(webSocket)
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val msg = json.parseToJsonElement(text).jsonObject
                    val reqId = msg["reqId"]!!.jsonPrimitive.content
                    when (msg["type"]!!.jsonPrimitive.content) {
                        "join" -> webSocket.send("""{"type":"ack","reqId":"$reqId","ok":true,"data":{"membershipId":"m1","memberCount":3}}""")
                        "heartbeat" -> webSocket.send("""{"type":"ack","reqId":"$reqId","ok":true,"data":{"state":"outside","removed":true},"reason":"out_of_range"}""")
                        "ping" -> webSocket.send("""{"type":"pong","reqId":"$reqId"}""")
                    }
                }
            }).build(),
        )
    }

    @Test
    fun `sends the bearer token on the upgrade and matches acks by reqId`() = runBlocking {
        val session = FakeSession("token-1")
        enqueueSocket("token-1") { ws -> ws.send("""{"type":"presence","venueId":"v1","count":2}""") }
        val client = RealtimeClient(okhttp, server.url("/ws").toString().replace("http", "ws"), session, session, json)

        client.connect()
        assertTrue(client.awaitConnected(5_000))
        val upgrade = server.takeRequest()
        assertEquals("Bearer token-1", upgrade.headers["Authorization"])

        val join = client.join("v1")
        assertTrue(join.ok)
        assertEquals("3", join.data?.get("memberCount")?.jsonPrimitive?.content)

        val hb = client.heartbeat("v1", 52.5, 13.4, 10.0, mocked = false)
        assertEquals("outside", hb.state)
        assertTrue(hb.removed)
        assertEquals("out_of_range", hb.reason)

        client.disconnect()
        assertEquals(ConnectionState.Disconnected, client.state.value)
    }

    @Test
    fun `refreshes the token after a 401 upgrade and reconnects`() = runBlocking {
        val session = FakeSession("stale")
        server.enqueue(MockResponse.Builder().code(401).build())
        val opened = CountDownLatch(1)
        enqueueSocket("fresh-token") { opened.countDown() }
        val client = RealtimeClient(okhttp, server.url("/ws").toString().replace("http", "ws"), session, session, json)

        client.connect()
        assertTrue(withTimeout(10_000) { client.awaitConnected(10_000) })
        assertTrue(opened.await(5, TimeUnit.SECONDS))
        assertEquals(1, session.refreshes.get())
        server.takeRequest()
        assertEquals("Bearer fresh-token", server.takeRequest().headers["Authorization"])
        client.disconnect()
    }

    @Test
    fun `requests fail fast when not connected`() = runBlocking {
        val session = FakeSession("t")
        val client = RealtimeClient(okhttp, "ws://127.0.0.1:1/ws", session, session, json)
        val ack = client.join("v1")
        assertFalse(ack.ok)
        assertEquals("not_connected", ack.reason)
    }
}
