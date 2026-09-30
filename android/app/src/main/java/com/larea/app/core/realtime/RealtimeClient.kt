package com.larea.app.core.realtime

import android.util.Log
import com.larea.app.core.auth.SessionSource
import com.larea.app.core.auth.TokenRefreshing
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "Realtime"
private const val CLOSE_UNAUTHORIZED = 4401
private const val CLOSE_SUSPENDED = 4403

/**
 * Plain WebSocket client for `/ws`. Authenticates on the upgrade with the bearer token,
 * reconnects with exponential backoff, refreshes the token on 401/4401, and matches
 * `ack` events to requests by `reqId`.
 */
class RealtimeClient(
    private val client: OkHttpClient,
    private val wsUrl: String,
    private val store: SessionSource,
    private val refresher: TokenRefreshing,
    private val json: Json,
    /** Sent as X-Larea-Build ("solana" for the dApp Store build), like REST requests. */
    private val build: String? = null,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _state = MutableStateFlow(ConnectionState.Disconnected)
    val state: StateFlow<ConnectionState> = _state
    private val _events = MutableSharedFlow<ServerEvent>(extraBufferCapacity = 256)
    val events: SharedFlow<ServerEvent> = _events

    private var socket: WebSocket? = null
    private var loop: Job? = null
    private var wanted = false
    private val pending = ConcurrentHashMap<String, CompletableDeferred<ServerEvent.Ack>>()
    private val counter = AtomicInteger()

    fun connect() {
        if (wanted) return
        wanted = true
        loop = scope.launch { runLoop() }
    }

    fun disconnect() {
        wanted = false
        loop?.cancel()
        socket?.close(1000, "bye")
        socket?.cancel()
        socket = null
        failPending("disconnected")
        _state.value = ConnectionState.Disconnected
    }

    suspend fun join(venueId: String): ServerEvent.Ack = request(buildJsonObject { put("type", "join"); put("venueId", venueId) })

    suspend fun leave(venueId: String): ServerEvent.Ack = request(buildJsonObject { put("type", "leave"); put("venueId", venueId) })

    suspend fun heartbeat(venueId: String, lat: Double, lng: Double, accuracy: Double, mocked: Boolean): HeartbeatAck {
        val ack = request(
            buildJsonObject {
                put("type", "heartbeat"); put("venueId", venueId)
                put("lat", lat); put("lng", lng); put("accuracy", accuracy); put("mocked", mocked)
            },
        )
        val data = ack.data
        return HeartbeatAck(
            ok = ack.ok,
            state = data?.get("state")?.jsonPrimitive?.content,
            removed = data?.get("removed")?.jsonPrimitive?.content == "true",
            reason = ack.reason,
        )
    }

    private suspend fun request(message: JsonObject, timeoutMs: Long = 8_000): ServerEvent.Ack {
        val reqId = "r${counter.incrementAndGet()}"
        val deferred = CompletableDeferred<ServerEvent.Ack>()
        pending[reqId] = deferred
        val payload = JsonObject(message + ("reqId" to json.parseToJsonElement("\"$reqId\"")))
        val sent = socket?.send(json.encodeToString(JsonObject.serializer(), payload)) == true
        if (!sent) {
            pending.remove(reqId)
            return ServerEvent.Ack(reqId, ok = false, reason = "not_connected")
        }
        return withTimeoutOrNull(timeoutMs) { deferred.await() } ?: run {
            pending.remove(reqId)
            ServerEvent.Ack(reqId, ok = false, reason = "timeout")
        }
    }

    private suspend fun runLoop() {
        var attempt = 0
        while (wanted) {
            val token = store.accessToken()
            if (token == null) {
                _state.value = ConnectionState.Disconnected
                delay(2_000)
                continue
            }
            _state.value = ConnectionState.Connecting
            val outcome = CompletableDeferred<CloseOutcome>()
            val request = Request.Builder().url(wsUrl).header("Authorization", "Bearer $token")
                .apply { build?.let { header("X-Larea-Build", it) } }
                .build()
            socket = client.newWebSocket(request, Listener(outcome))
            when (val result = outcome.await()) {
                CloseOutcome.Unauthorized -> {
                    if (refresher.refresh(token) == null) {
                        wanted = false
                        _state.value = ConnectionState.Disconnected
                        return
                    }
                    attempt = 0
                }
                CloseOutcome.Suspended -> {
                    _state.value = ConnectionState.Suspended
                    wanted = false
                    return
                }
                is CloseOutcome.Other -> {
                    _state.value = ConnectionState.Disconnected
                    if (!wanted) return
                    attempt++
                    delay(reconnectDelayMs(attempt))
                }
            }
        }
    }

    private sealed class CloseOutcome {
        data object Unauthorized : CloseOutcome()
        data object Suspended : CloseOutcome()
        data class Other(val reason: String) : CloseOutcome()
    }

    private inner class Listener(private val outcome: CompletableDeferred<CloseOutcome>) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            _state.value = ConnectionState.Connected
        }

        override fun onMessage(webSocket: WebSocket, text: String) = ingest(text)

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            failPending("closed")
            outcome.complete(
                when (code) {
                    CLOSE_UNAUTHORIZED -> CloseOutcome.Unauthorized
                    CLOSE_SUSPENDED -> CloseOutcome.Suspended
                    else -> CloseOutcome.Other(reason)
                },
            )
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            failPending("failure")
            outcome.complete(
                when (response?.code) {
                    401 -> CloseOutcome.Unauthorized
                    403 -> CloseOutcome.Suspended
                    else -> CloseOutcome.Other(t.message ?: "failure")
                },
            )
        }
    }

    /** Decodes one frame and hands it to every listener; unknown or broken frames are dropped. */
    internal fun ingest(text: String) {
        val event = runCatching { json.decodeFromString(ServerEvent.serializer(), text) }.getOrElse {
            runCatching { Log.w(TAG, "dropped event: ${it.message}") }
            return
        }
        if (event is ServerEvent.Ack && event.reqId != null) {
            pending.remove(event.reqId)?.complete(event)
        }
        _events.tryEmit(event)
    }

    private fun failPending(reason: String) {
        for ((id, deferred) in pending) deferred.complete(ServerEvent.Ack(id, ok = false, reason = reason))
        pending.clear()
    }

    /** Suspends until the socket is connected (or the timeout elapses). */
    suspend fun awaitConnected(timeoutMs: Long = 10_000): Boolean =
        withTimeoutOrNull(timeoutMs) { state.first { it == ConnectionState.Connected } } != null
}
