package com.larea.app.feature.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.location.Fix
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.CreateReportRequest
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.SendMessageRequest
import com.larea.app.core.network.apiCall
import com.larea.app.core.realtime.ConnectionState
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.core.realtime.ServerEvent
import com.larea.app.core.network.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import javax.inject.Inject

data class PendingMessage(val clientKey: String, val text: String)

data class ChatUiState(
    val venueId: String,
    val myUserId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val pending: List<PendingMessage> = emptyList(),
    val presence: Int = 0,
    val connection: ConnectionState = ConnectionState.Disconnected,
    val weakGps: Boolean = false,
    val mutedUntil: String? = null,
    val removed: String? = null,
    val loading: Boolean = true,
)

sealed interface ChatEvent {
    data class Notice(val text: String) : ChatEvent
    data object Left : ChatEvent
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: LareaApi,
    private val realtime: RealtimeClient,
    private val location: LocationSource,
    private val sessions: SessionRepository,
) : ViewModel() {
    private val venueId: String = checkNotNull(savedState["venueId"])
    private val _state = MutableStateFlow(ChatUiState(venueId))
    val state: StateFlow<ChatUiState> = _state
    private val _events = MutableSharedFlow<ChatEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<ChatEvent> = _events

    @Volatile private var latestFix: Fix? = null
    private var heartbeatIntervalSec = 25
    private var jobs: List<Job> = emptyList()
    private var started = false

    fun start() {
        if (started) return
        started = true
        viewModelScope.launch {
            val me = sessions.session.first()?.user
            _state.update { it.copy(myUserId = me?.id, mutedUntil = me?.mutedUntil?.takeIf { m -> isFuture(m) }) }
        }
        loadHistory()
        realtime.connect()
        jobs = listOf(
            viewModelScope.launch { realtime.state.collect(::onConnection) },
            viewModelScope.launch { realtime.events.collect(::onEvent) },
            viewModelScope.launch {
                location.fixes(10_000L).catch { }.collect { fix -> latestFix = fix }
            },
            viewModelScope.launch {
                while (true) {
                    delay(heartbeatIntervalSec * 1000L)
                    sendHeartbeat()
                }
            },
        )
    }

    private fun loadHistory() {
        viewModelScope.launch {
            apiCall { api.history(venueId) }
                .onSuccess { res -> _state.update { it.copy(messages = res.messages, loading = false) } }
                .onFailure { e ->
                    _state.update { it.copy(loading = false) }
                    if ((e as? ApiException)?.code == "NOT_MEMBER") rejoin() else _events.tryEmit(ChatEvent.Notice(e.userMessage()))
                }
        }
    }

    private suspend fun onConnection(state: ConnectionState) {
        _state.update { it.copy(connection = state) }
        if (state == ConnectionState.Connected) {
            val ack = realtime.join(venueId)
            if (!ack.ok && ack.reason == "not_member") {
                rejoin()
                return
            }
            ack.data?.get("memberCount")?.jsonPrimitive?.content?.toIntOrNull()?.let { c -> _state.update { it.copy(presence = c) } }
            ack.data?.get("timing")?.jsonObject?.get("heartbeatIntervalSec")?.jsonPrimitive?.content?.toIntOrNull()?.let { heartbeatIntervalSec = it }
            sendHeartbeat()
            // Fill any gap that opened while we were disconnected.
            val lastId = _state.value.messages.lastOrNull()?.id
            if (lastId != null) apiCall { api.history(venueId, afterId = lastId) }.onSuccess { res -> res.messages.forEach(::addMessage) }
        }
    }

    private suspend fun sendHeartbeat() {
        val fix = latestFix ?: return
        if (_state.value.connection != ConnectionState.Connected) return
        val ack = realtime.heartbeat(venueId, fix.lat, fix.lng, fix.accuracyM, fix.mocked)
        if (!ack.ok && ack.reason == "not_member") {
            rejoin()
            return
        }
        _state.update { it.copy(weakGps = ack.state == "weak_gps") }
    }

    /** Silent rejoin after a quiet period (app was backgrounded); gives up with the server's message. */
    private suspend fun rejoin() {
        val fix = latestFix ?: location.awaitFix() ?: run {
            _state.update { it.copy(removed = "We couldn't confirm your location.") }
            return
        }
        apiCall { api.join(venueId, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked)) }
            .onSuccess {
                if (_state.value.connection == ConnectionState.Connected) realtime.join(venueId)
                loadHistory()
            }
            .onFailure { e -> _state.update { it.copy(removed = e.userMessage()) } }
    }

    private suspend fun onEvent(event: ServerEvent) {
        when (event) {
            is ServerEvent.Message -> if (event.message.venueId == venueId) addMessage(event.message)
            is ServerEvent.MessageHidden -> _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == event.messageId }) }
            is ServerEvent.Presence -> if (event.venueId == venueId) _state.update { it.copy(presence = event.count) }
            is ServerEvent.Enforcement -> {
                _state.update { it.copy(mutedUntil = if (event.kind == "mute") event.until else it.mutedUntil) }
                _events.tryEmit(ChatEvent.Notice(event.message))
            }
            is ServerEvent.Removed -> if (event.venueId == venueId) {
                when (event.reason) {
                    "stale" -> rejoin()
                    "replaced", "user_left" -> _events.tryEmit(ChatEvent.Left)
                    else -> _state.update { it.copy(removed = event.message) }
                }
            }
            else -> Unit
        }
    }

    private fun addMessage(message: ChatMessage) {
        _state.update { s ->
            if (s.messages.any { it.id == message.id }) s
            else s.copy(messages = (s.messages + message).sortedBy { it.createdAt })
        }
    }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        val pending = PendingMessage(UUID.randomUUID().toString(), trimmed)
        _state.update { it.copy(pending = it.pending + pending) }
        viewModelScope.launch {
            apiCall { api.send(venueId, SendMessageRequest.text(trimmed, pending.clientKey)) }
                .onSuccess { res ->
                    res.message?.let(::addMessage)
                    res.notice?.let { _events.tryEmit(ChatEvent.Notice(it)) }
                }
                .onFailure { e ->
                    when ((e as? ApiException)?.code) {
                        "MUTED" -> _state.update { it.copy(mutedUntil = e.mutedUntil) }
                        "NOT_PRESENT" -> rejoin()
                    }
                    _events.tryEmit(ChatEvent.Notice(e.userMessage()))
                }
            _state.update { s -> s.copy(pending = s.pending.filterNot { it.clientKey == pending.clientKey }) }
        }
    }

    fun report(messageId: String, reason: String) {
        viewModelScope.launch {
            apiCall { api.report(messageId, CreateReportRequest(reason)) }
                .onSuccess { _events.tryEmit(ChatEvent.Notice("Thanks, your report was sent.")) }
                .onFailure { e -> _events.tryEmit(ChatEvent.Notice(e.userMessage())) }
        }
    }

    fun block(userId: String, displayName: String) {
        viewModelScope.launch {
            apiCall { api.block(userId) }
                .onSuccess {
                    _state.update { s -> s.copy(messages = s.messages.filterNot { it.author.id == userId }) }
                    _events.tryEmit(ChatEvent.Notice("$displayName is blocked."))
                }
                .onFailure { e -> _events.tryEmit(ChatEvent.Notice(e.userMessage())) }
        }
    }

    fun leave() {
        viewModelScope.launch {
            apiCall { api.leave(venueId) }
            _events.tryEmit(ChatEvent.Left)
        }
    }

    override fun onCleared() {
        jobs.forEach { it.cancel() }
        realtime.disconnect()
    }

    private fun isFuture(iso: String): Boolean = runCatching { java.time.Instant.parse(iso).isAfter(java.time.Instant.now()) }.getOrDefault(false)
}
