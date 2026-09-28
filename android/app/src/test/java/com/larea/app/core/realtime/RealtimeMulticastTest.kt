package com.larea.app.core.realtime

import com.larea.app.core.auth.SessionSource
import com.larea.app.core.auth.TokenRefreshing
import com.larea.app.core.network.LareaJson
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test

/** Mirrors ios/LareaTests/RealtimeMulticastTests.swift: every listener sees each frame; garbage is dropped. */
class RealtimeMulticastTest {
    private object NoSession : SessionSource, TokenRefreshing {
        override suspend fun accessToken(): String? = null
        override suspend fun refresh(staleAccessToken: String?): String? = null
    }

    private val client = RealtimeClient(OkHttpClient(), "ws://localhost:1/ws", NoSession, NoSession, LareaJson)

    @Test
    fun `every collector receives each frame and garbage is dropped`() = runBlocking {
        val first = async(start = CoroutineStart.UNDISPATCHED) { client.events.take(2).toList() }
        val second = async(start = CoroutineStart.UNDISPATCHED) { client.events.take(2).toList() }
        yield()
        client.ingest("not json")
        client.ingest("""{"type":"hologram"}""")
        client.ingest("""{"type":"presence","venueId":"v1","count":3}""")
        client.ingest("""{"type":"pong"}""")
        val a = withTimeout(2_000) { first.await() }
        val b = withTimeout(2_000) { second.await() }
        assertEquals(listOf(ServerEvent.Presence("v1", 3), ServerEvent.Pong(null)), a)
        assertEquals(a, b)
    }
}
