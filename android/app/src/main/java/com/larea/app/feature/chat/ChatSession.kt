package com.larea.app.feature.chat

import com.larea.app.core.auth.SessionStore
import com.larea.app.core.format.Dates
import com.larea.app.core.location.LocationSource
import com.larea.app.core.media.ImageUploader
import com.larea.app.core.media.PreparedImage
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.Author
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.CreatePollRequest
import com.larea.app.core.network.CreateReportRequest
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.SendMessageRequest
import com.larea.app.core.network.SendResult
import com.larea.app.core.network.VoteRequest
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.apiCode
import com.larea.app.core.network.userMessage
import com.larea.app.core.realtime.ConnectionState
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.core.realtime.ServerEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class ChatState(
    val venueId: String,
    val myUserId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val pending: List<PendingMessage> = emptyList(),
    val presence: Int = 0,
    val connection: ConnectionState = ConnectionState.Disconnected,
    val weakGps: Boolean = false,
    val mutedUntil: String? = null,
    /** Set when the server removed us; the removed sheet shows it. */
    val removed: String? = null,
    /** One-off message for an alert. */
    val notice: String? = null,
    val notices: List<SystemNotice> = emptyList(),
    /** Grows on every accepted send (haptic + scroll to bottom). */
    val sentCount: Int = 0,
    val removedCount: Int = 0,
    /** The chat ended (left, replaced by another device). */
    val left: Boolean = false,
    val loading: Boolean = true,
    /** MAIN_ROOM, or REGULARS_ROOM in the Solana build. */
    val room: String = MAIN_ROOM,
) {
    val isMuted: Boolean get() = Dates.isFuture(mutedUntil)
}

const val MAIN_ROOM = "MAIN"
const val REGULARS_ROOM = "REGULARS"


/**
 * One venue chat: history, realtime events, heartbeats and sending (the iOS `ChatViewModel`).
 * Owned by the app router, not a screen, so it keeps running while the user looks at another tab.
 */
class ChatSession(
    val venueId: String,
    private val api: LareaApi,
    private val uploader: ImageUploader,
    private val realtime: RealtimeClient,
    private val location: LocationSource,
    private val store: SessionStore,
) {
    private val _state = MutableStateFlow(ChatState(venueId))
    val state: StateFlow<ChatState> = _state

    private var scope: CoroutineScope? = null
    private var heartbeatIntervalSec = 25

    fun start() {
        if (scope != null) return
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).also { this.scope = it }
        scope.launch {
            val me = store.current()?.user
            _state.update { it.copy(myUserId = me?.id, mutedUntil = me?.mutedUntil?.takeIf(Dates::isFuture)) }
        }
        realtime.connect()
        scope.launch { location.updates.collect { } } // keeps fixes coming while the chat is open
        scope.launch { realtime.events.collect(::handle) }
        scope.launch { loadHistory() }
        scope.launch { realtime.state.collect { onConnection(it) } }
        scope.launch {
            while (isActive) {
                delay(heartbeatIntervalSec * 1000L)
                sendHeartbeat()
            }
        }
    }

    /** Ends this chat session. The socket stays open: other screens (members, deals) use it too. */
    fun stop() {
        scope?.cancel()
        scope = null
    }

    private fun launch(block: suspend CoroutineScope.() -> Unit): Job? = scope?.launch(block = block)

    // Connection and presence

    private suspend fun onConnection(connection: ConnectionState) {
        _state.update { it.copy(connection = connection) }
        if (connection != ConnectionState.Connected) return
        val ack = realtime.join(venueId)
        if (!ack.ok && ack.reason == "not_member") {
            rejoin()
            return
        }
        ack.data?.get("memberCount")?.jsonPrimitive?.intOrNull?.let { count -> _state.update { it.copy(presence = count) } }
        runCatching { ack.data?.get("timing")?.jsonObject?.get("heartbeatIntervalSec")?.jsonPrimitive?.intOrNull }.getOrNull()?.let { heartbeatIntervalSec = it }
        sendHeartbeat()
        val lastId = _state.value.messages.lastOrNull()?.id ?: return
        apiCall { api.history(venueId, afterId = lastId, room = roomParam()) }.onSuccess { gap -> gap.messages.forEach(::add) }
    }

    private suspend fun sendHeartbeat() {
        if (_state.value.connection != ConnectionState.Connected) return
        val fix = location.latest.value ?: return
        val ack = realtime.heartbeat(venueId, fix.lat, fix.lng, fix.accuracyM, fix.mocked)
        if (!ack.ok && ack.reason == "not_member") {
            rejoin()
            return
        }
        _state.update { it.copy(weakGps = ack.state == "weak_gps") }
    }

    /** Silent rejoin after a quiet period; gives up with the server's message. */
    private suspend fun rejoin() {
        val fix = location.latest.value ?: location.awaitFix()
        if (fix == null) {
            _state.update { it.copy(removed = "We couldn't confirm your location.", removedCount = it.removedCount + 1) }
            return
        }
        apiCall { api.join(venueId, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked)) }
            .onSuccess {
                if (_state.value.connection == ConnectionState.Connected) realtime.join(venueId)
                loadHistory()
            }
            .onFailure { e -> _state.update { it.copy(removed = e.userMessage(), removedCount = it.removedCount + 1) } }
    }

    // Messages

    /** The server's room parameter: omitted for the main chat, so older servers see the same requests. */
    private fun roomParam(): String? = _state.value.room.takeIf { it != MAIN_ROOM }

    /** Shows another room of this place (the Solana build's Regulars room). */
    fun switchRoom(room: String) {
        if (room == _state.value.room) return
        _state.update { it.copy(room = room, messages = emptyList(), loading = true) }
        launch { loadHistory() }
    }

    private suspend fun loadHistory() {
        val room = _state.value.room
        apiCall { api.history(venueId, room = roomParam()) }
            .onSuccess { history -> _state.update { if (it.room == room) it.copy(messages = history.messages, loading = false) else it } }
            .onFailure { e ->
                _state.update { it.copy(loading = false) }
                if (e.apiCode == "LEVEL_REQUIRED") {
                    _state.update { it.copy(room = MAIN_ROOM, notice = e.userMessage()) }
                    loadHistory()
                    return
                }
                if (e.apiCode == "NOT_MEMBER") rejoin() else _state.update { it.copy(notice = e.userMessage()) }
            }
    }

    private fun handle(event: ServerEvent) {
        when (event) {
            is ServerEvent.Message -> if (event.message.venueId == venueId) add(event.message)
            is ServerEvent.MessageHidden -> _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == event.messageId }) }
            is ServerEvent.Presence -> if (event.venueId == venueId) _state.update { it.copy(presence = event.count) }
            is ServerEvent.PollUpdate -> if (event.venueId == venueId) {
                _state.update { s ->
                    s.copy(messages = s.messages.map { m -> if (m.id == event.messageId) m.copy(poll = m.poll?.merging(event.poll) ?: event.poll) else m })
                }
            }
            is ServerEvent.Enforcement -> {
                if (event.kind == "mute" && event.until != null) _state.update { it.copy(mutedUntil = event.until) }
                addNotice(SystemNotice.Kind.Info, event.message)
            }
            is ServerEvent.Removed -> if (event.venueId == venueId) {
                when (event.reason) {
                    "stale" -> launch { rejoin() }
                    "replaced", "user_left" -> _state.update { it.copy(left = true) }
                    else -> _state.update { it.copy(removed = event.message, removedCount = it.removedCount + 1) }
                }
            }
            else -> Unit
        }
    }

    private fun add(message: ChatMessage) {
        _state.update { s ->
            if ((message.room ?: MAIN_ROOM) != s.room || s.messages.any { it.id == message.id }) s else s.copy(messages = (s.messages + message).sortedBy { it.createdAt })
        }
    }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        val item = PendingMessage(UUID.randomUUID().toString(), trimmed)
        _state.update { it.copy(pending = it.pending + item) }
        launch {
            apiCall { api.send(venueId, SendMessageRequest.text(trimmed, item.id, roomParam())) }
                .onSuccess { apply(it, "This message doesn't meet our community guidelines.") }
                .onFailure { handleSendError(it) }
            removePending(item.id)
        }
    }

    /** Uploads the photo (already downsized on the device), then sends it like any other message. */
    fun sendImage(image: PreparedImage, caption: String?) {
        val trimmed = caption?.trim().orEmpty()
        val item = PendingMessage(UUID.randomUUID().toString(), trimmed, image, uploading = true)
        _state.update { it.copy(pending = it.pending + item) }
        launch {
            uploader.upload(image)
                .onSuccess { media ->
                    _state.update { s -> s.copy(pending = s.pending.map { if (it.id == item.id) it.copy(uploading = false) else it }) }
                    apiCall { api.send(venueId, SendMessageRequest.image(media.id ?: "", trimmed, item.id, roomParam())) }
                        .onSuccess { apply(it, "This photo doesn't meet our community guidelines.") }
                        .onFailure { handleSendError(it) }
                }
                .onFailure { handleSendError(it) }
            removePending(item.id)
        }
    }

    /** Posts a poll into the chat; question and options are moderated together on the server. */
    fun createPoll(draft: PollDraft) {
        val clean = PollValidation.cleaned(draft)
        launch {
            apiCall { api.createPoll(venueId, CreatePollRequest(clean.question, clean.options, clean.duration.minutes, UUID.randomUUID().toString())) }
                .onSuccess { apply(it, "Polls can't contain that language. Please rephrase it.") }
                .onFailure { handleSendError(it) }
        }
    }

    /** Votes optimistically; the server's counts replace ours, or the change is rolled back. */
    fun vote(messageId: String, optionId: String) {
        val message = _state.value.messages.firstOrNull { it.id == messageId } ?: return
        val before = message.poll ?: return
        if (before.isClosed()) return
        var options = before.options
        var total = before.totalVotes
        val previous = before.myOptionId
        if (previous != null) {
            options = options.map { if (it.id == previous) it.copy(votes = maxOf(0, it.votes - 1)) else it }
        } else {
            total += 1
        }
        options = options.map { if (it.id == optionId) it.copy(votes = it.votes + 1) else it }
        setPoll(messageId, before.copy(options = options, totalVotes = total, myOptionId = optionId))
        launch {
            apiCall { api.vote(before.id, VoteRequest(optionId)) }
                .onSuccess { setPoll(messageId, it.poll) }
                .onFailure { e ->
                    setPoll(messageId, before)
                    if (e.apiCode == "NOT_MEMBER") rejoin()
                    _state.update { it.copy(notice = e.userMessage()) }
                }
        }
    }

    fun closePoll(messageId: String) {
        val poll = _state.value.messages.firstOrNull { it.id == messageId }?.poll ?: return
        launch {
            apiCall { api.closePoll(poll.id) }
                .onSuccess { setPoll(messageId, it.poll) }
                .onFailure { e -> _state.update { it.copy(notice = e.userMessage()) } }
        }
    }

    private fun setPoll(messageId: String, poll: com.larea.app.core.network.PollView) {
        _state.update { s -> s.copy(messages = s.messages.map { if (it.id == messageId) it.copy(poll = poll) else it }) }
    }

    private fun apply(result: SendResult, blockedFallback: String) {
        result.message?.let(::add)
        when (result.status) {
            "blocked" -> addNotice(SystemNotice.Kind.Blocked, result.notice ?: blockedFallback)
            "censored" -> {
                _state.update { it.copy(sentCount = it.sentCount + 1) }
                addNotice(SystemNotice.Kind.Censored, result.notice ?: "Part of your message was masked.")
            }
            else -> {
                _state.update { it.copy(sentCount = it.sentCount + 1) }
                result.notice?.let { addNotice(SystemNotice.Kind.Warned, it) }
            }
        }
    }

    private suspend fun handleSendError(error: Throwable) {
        if (error is ApiException) {
            if (error.code == "MUTED" && error.mutedUntil != null) _state.update { it.copy(mutedUntil = error.mutedUntil) }
            if (error.code == "NOT_PRESENT") rejoin()
        }
        _state.update { it.copy(notice = error.userMessage()) }
    }

    private fun removePending(id: String) = _state.update { s -> s.copy(pending = s.pending.filterNot { it.id == id }) }

    fun report(message: ChatMessage, reason: String) {
        launch {
            val result = apiCall { api.report(message.id, CreateReportRequest(reason)) }
            _state.update { it.copy(notice = result.exceptionOrNull()?.userMessage() ?: "Thanks, your report was sent.") }
        }
    }

    fun block(author: Author) {
        launch {
            apiCall { api.block(author.id) }
                .onSuccess {
                    _state.update { s -> s.copy(messages = s.messages.filterNot { it.author.id == author.id }, notice = "${author.displayName} is blocked.") }
                }
                .onFailure { e -> _state.update { it.copy(notice = e.userMessage()) } }
        }
    }

    fun leave() {
        launch {
            apiCall { api.leave(venueId) }
            _state.update { it.copy(left = true) }
        }
    }

    fun dismissNotice() = _state.update { it.copy(notice = null) }

    private fun addNotice(kind: SystemNotice.Kind, text: String) {
        _state.update { s -> s.copy(notices = (s.notices + SystemNotice(UUID.randomUUID().toString(), kind, text)).takeLast(5)) }
    }
}

/** Builds chat sessions with the app's shared services. */
@Singleton
class ChatSessionFactory @Inject constructor(
    private val api: LareaApi,
    private val uploader: ImageUploader,
    private val realtime: RealtimeClient,
    private val location: LocationSource,
    private val store: SessionStore,
) {
    fun create(venueId: String) = ChatSession(venueId, api, uploader, realtime, location, store)
}

