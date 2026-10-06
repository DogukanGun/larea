package com.larea.app.feature.pins

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.larea.app.core.auth.SessionStore
import com.larea.app.core.format.Dates
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.Author
import com.larea.app.core.network.BanUserRequest
import com.larea.app.core.network.CreateReportRequest
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.MessagePin
import com.larea.app.core.network.PinMessage
import com.larea.app.core.network.PinTextRequest
import com.larea.app.core.network.SendPinMessageRequest
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.core.realtime.ConnectionState
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.core.realtime.ServerEvent
import com.larea.app.ui.components.Avatar
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.ReportReasons
import com.larea.app.ui.components.ReportSheet
import com.larea.app.ui.components.AvatarPalette
import com.larea.app.ui.navigation.NearbyPin
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class PinChatState(
    val pin: MessagePin? = null,
    val messages: List<PinMessage> = emptyList(),
    val draft: String = "",
    val loading: Boolean = true,
    val sending: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** Set when the pin went away (expired, removed, or its owner removed us). */
    val closed: String? = null,
    val myUserId: String? = null,
) {
    val canChat: Boolean get() = pin?.canChat == true && closed == null
    val isOwner: Boolean get() = pin?.mine == true
}

/** One message pin: its pinned message on top and the chat under it. Its owner runs the chat. */
@HiltViewModel
class PinChatViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: LareaApi,
    private val realtime: RealtimeClient,
    private val location: LocationSource,
    private val store: SessionStore,
) : ViewModel() {
    val pinId: String = savedState.toRoute<NearbyPin>().id
    private val _state = MutableStateFlow(PinChatState())
    val state: StateFlow<PinChatState> = _state
    private var jobs: List<Job> = emptyList()
    private var followed = false

    private fun fixQuery(): Map<String, String> {
        val fix = location.latest.value ?: return emptyMap()
        return mapOf("lat" to fix.lat.toString(), "lng" to fix.lng.toString(), "accuracy" to fix.accuracyM.toString())
    }

    fun start() {
        if (jobs.isNotEmpty()) return
        jobs = listOf(
            viewModelScope.launch { realtime.events.collect(::handle) },
            // Follow again after every reconnect: the server forgets subscriptions with the socket.
            viewModelScope.launch { realtime.state.collect { if (it == ConnectionState.Connected) follow() } },
            viewModelScope.launch {
                _state.update { it.copy(myUserId = store.current()?.user?.id) }
                load()
            },
        )
    }

    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        if (followed) {
            followed = false
            viewModelScope.launch { runCatching { realtime.unsubscribePin(pinId) } }
        }
    }

    suspend fun load() {
        _state.update { it.copy(loading = true) }
        apiCall { api.pin(pinId, fixQuery()) }
            .onSuccess { pin ->
                _state.update { it.copy(pin = pin) }
                if (pin.canChat) {
                    apiCall { api.pinMessages(pinId, fixQuery()) }
                        .onSuccess { r -> _state.update { it.copy(messages = r.messages) } }
                        .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
                    follow()
                }
            }
            .onFailure { e ->
                if ((e as? com.larea.app.core.network.ApiException)?.status == 404) _state.update { it.copy(closed = e.userMessage()) }
                else _state.update { it.copy(error = e.userMessage()) }
            }
        _state.update { it.copy(loading = false) }
    }

    private suspend fun follow() {
        if (!_state.value.canChat || realtime.state.value != ConnectionState.Connected) return
        val fix = location.latest.value
        val ack = realtime.subscribePin(pinId, fix?.lat ?: 0.0, fix?.lng ?: 0.0, fix?.accuracyM ?: 0.0, fix?.mocked ?: false)
        followed = ack.ok
        val last = _state.value.messages.lastOrNull() ?: return
        if (ack.ok) {
            apiCall { api.pinMessages(pinId, fixQuery() + ("afterId" to last.id)) }.onSuccess { r ->
                _state.update { s -> s.copy(messages = s.messages + r.messages.filter { m -> s.messages.none { it.id == m.id } }) }
            }
        }
    }

    fun setDraft(text: String) = _state.update { it.copy(draft = text) }

    fun send() {
        val text = _state.value.draft.trim()
        if (text.isEmpty() || _state.value.sending) return
        viewModelScope.launch {
            _state.update { it.copy(sending = true) }
            val fix = location.latest.value?.let { LocationFixBody(it.lat, it.lng, it.accuracyM, it.mocked) }
            apiCall { api.sendPinMessage(pinId, SendPinMessageRequest(text, UUID.randomUUID().toString(), fix)) }
                .onSuccess { result ->
                    _state.update { s ->
                        val message = result.message
                        s.copy(
                            draft = "",
                            notice = result.notice,
                            messages = if (message != null && s.messages.none { it.id == message.id }) s.messages + message else s.messages,
                        )
                    }
                }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(sending = false) }
        }
    }

    fun hide(message: PinMessage) = viewModelScope.launch {
        apiCall { api.hidePinMessage(pinId, message.id) }
            .onSuccess { _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == message.id }) } }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
    }

    fun removeFromChat(author: Author) = viewModelScope.launch {
        apiCall { api.banFromPin(pinId, BanUserRequest(author.id)) }
            .onSuccess {
                _state.update { s -> s.copy(messages = s.messages.filterNot { it.author.id == author.id }, notice = "${author.displayName} can no longer join this chat.") }
            }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
    }

    fun edit(text: String) = viewModelScope.launch {
        apiCall { api.editPin(pinId, PinTextRequest(text.trim())) }
            .onSuccess { pin -> _state.update { it.copy(pin = it.pin?.copy(text = pin.text, editedAt = pin.editedAt)) } }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
    }

    fun report(message: PinMessage?, reason: String) = viewModelScope.launch {
        val body = CreateReportRequest(reason)
        apiCall { if (message != null) api.reportPinMessage(message.id, body) else api.reportPin(pinId, body) }
            .onSuccess { _state.update { it.copy(notice = "Thanks. Our moderators will take a look.") } }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
    }

    fun dismissError() = _state.update { it.copy(error = null) }
    fun dismissNotice() = _state.update { it.copy(notice = null) }

    private fun handle(event: ServerEvent) {
        when (event) {
            is ServerEvent.PinMessageEvent -> if (event.message.pinId == pinId) {
                _state.update { s -> if (s.messages.any { it.id == event.message.id }) s else s.copy(messages = s.messages + event.message) }
            }
            is ServerEvent.PinMessageHidden -> if (event.pinId == pinId) {
                _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == event.messageId }) }
            }
            is ServerEvent.PinUpdated -> if (event.pinId == pinId) {
                _state.update { s -> s.copy(pin = s.pin?.copy(text = event.text, editedAt = event.editedAt)) }
            }
            is ServerEvent.PinClosed -> if (event.pinId == pinId) {
                followed = false
                _state.update { it.copy(closed = event.message) }
            }
            else -> Unit
        }
    }

    override fun onCleared() = stop()
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PinChatScreen(onBack: () -> Unit, model: PinChatViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    var menu by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }
    var actionsFor by remember { mutableStateOf<PinMessage?>(null) }
    var reporting by remember { mutableStateOf<PinMessage?>(null) }
    var reportingPin by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Author?>(null) }
    val list = rememberLazyListState()

    DisposableEffect(Unit) {
        model.start()
        onDispose { model.stop() }
    }
    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) list.animateScrollToItem(state.messages.size)
    }

    Column(Modifier.fillMaxSize().background(c.grouped).imePadding()) {
        LareaTopBar(
            title = "Pinned message",
            onBack = onBack,
            actions = {
                Box {
                    IconButton(onClick = { menu = true }, enabled = state.pin != null) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "More", tint = c.brandPrimary)
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (state.isOwner) {
                            DropdownMenuItem(text = { Text("Edit message") }, onClick = { menu = false; editing = state.pin?.text.orEmpty() })
                        } else {
                            DropdownMenuItem(text = { Text("Report pin") }, onClick = { menu = false; reportingPin = true })
                        }
                    }
                }
            },
        )
        LazyColumn(
            state = list,
            verticalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = Spacing.screen),
        ) {
            item {
                val pin = state.pin
                when {
                    pin != null -> PinnedCard(pin, Modifier.padding(vertical = Spacing.s))
                    state.loading -> Box(Modifier.fillMaxWidth().padding(Spacing.xl), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
                val closed = state.closed
                when {
                    closed != null -> NoteCard(Icons.Filled.EventBusy, closed)
                    pin != null && !pin.canChat -> NoteCard(
                        Icons.AutoMirrored.Filled.DirectionsWalk,
                        "Get within 300 m of this pin to read and join its chat." + (pin.distanceText?.let { " You're about $it away." } ?: ""),
                    )
                    pin != null && state.messages.isEmpty() && !state.loading -> Text(
                        if (state.isOwner) "Your chat is open. People near the pin can write here." else "No messages yet. Say hello!",
                        style = LareaType.subheadline,
                        color = c.secondaryText,
                        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.l),
                    )
                }
            }
            items(state.messages, key = { it.id }) { message ->
                val mine = message.author.id == state.myUserId
                Box {
                    PinMessageRow(
                        message = message,
                        mine = mine,
                        ownerId = state.pin?.owner?.id,
                        modifier = Modifier.combinedClickable(onClick = {}, onLongClick = { if (!mine || state.isOwner) actionsFor = message }),
                    )
                    DropdownMenu(expanded = actionsFor?.id == message.id, onDismissRequest = { actionsFor = null }) {
                        if (state.isOwner) {
                            DropdownMenuItem(text = { Text("Hide message") }, onClick = { actionsFor = null; model.hide(message) })
                            if (!mine) DropdownMenuItem(text = { Text("Remove from chat", color = c.danger) }, onClick = { actionsFor = null; removing = message.author })
                        }
                        if (!mine) DropdownMenuItem(text = { Text("Report") }, onClick = { actionsFor = null; reporting = message })
                    }
                }
            }
            item { Spacer(Modifier.size(Spacing.l)) }
        }
        if (state.canChat) {
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s),
                modifier = Modifier.fillMaxWidth().background(c.card).padding(horizontal = Spacing.screen, vertical = Spacing.s).navigationBarsPadding(),
            ) {
                OutlinedTextField(
                    value = state.draft,
                    onValueChange = model::setDraft,
                    placeholder = { Text("Message") },
                    maxLines = 5,
                    shape = RoundedCornerShape(22.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = c.grouped, unfocusedContainerColor = c.grouped),
                    modifier = Modifier.weight(1f).testTag("pin.chat.composer"),
                )
                IconButton(
                    onClick = model::send,
                    enabled = !state.sending && state.draft.isNotBlank(),
                    modifier = Modifier.size(48.dp).background(c.brandPrimary, CircleShape).testTag("pin.chat.send"),
                ) {
                    if (state.sending) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    else Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = Color.White)
                }
            }
        }
    }

    editing?.let { text ->
        var value by remember(text) { mutableStateOf(text) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text("Edit your message", style = LareaType.headline) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    Text("Your edit is checked against the community guidelines like any message.", style = LareaType.footnote, color = c.secondaryText)
                    OutlinedTextField(value = value, onValueChange = { value = it }, maxLines = 6)
                }
            },
            confirmButton = { TextButton(onClick = { editing = null; model.edit(value) }, enabled = value.isNotBlank()) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel") } },
        )
    }
    removing?.let { author ->
        AlertDialog(
            onDismissRequest = { removing = null },
            title = { Text("Remove ${author.displayName} from this chat?", style = LareaType.headline) },
            text = { Text("They won't see this pin or be able to write here again.") },
            confirmButton = { TextButton(onClick = { removing = null; model.removeFromChat(author) }) { Text("Remove", color = c.danger) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
    reporting?.let { message ->
        ReportSheet("Report message", ReportReasons.chat, onDismiss = { reporting = null }) { reason ->
            reporting = null
            model.report(message, reason)
        }
    }
    if (reportingPin) {
        ReportSheet("Report pin", ReportReasons.chat, onDismiss = { reportingPin = false }) { reason ->
            reportingPin = false
            model.report(null, reason)
        }
    }
    state.error?.let { error ->
        AlertDialog(
            onDismissRequest = model::dismissError,
            title = { Text("Something went wrong", style = LareaType.headline) },
            text = { Text(error) },
            confirmButton = { TextButton(onClick = model::dismissError) { Text("OK") } },
        )
    }
    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = model::dismissNotice,
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = model::dismissNotice) { Text("OK") } },
        )
    }
}

@Composable
private fun PinnedCard(pin: MessagePin, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = modifier
            .fillMaxWidth()
            .background(c.sunny.copy(alpha = 0.35f), RoundedCornerShape(20.dp))
            .border(1.5.dp, c.sunny, RoundedCornerShape(20.dp))
            .padding(Spacing.l),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            Avatar(pin.owner.displayName, pin.owner.id, size = 32.dp)
            Column(Modifier.weight(1f)) {
                Text(pin.owner.displayName, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.text)
                Text(if (pin.mine) "You run this chat" else "Runs this chat", style = LareaType.caption, color = c.secondaryText)
            }
            Pill(pin.pinTier.title, style = PillStyle.Sunny, icon = Icons.Filled.PushPin)
        }
        Text(pin.text, style = LareaType.title3, color = c.text, modifier = Modifier.testTag("pin.chat.text"))
        val parts = listOfNotNull(
            pin.expiresAt?.let { if (Dates.isFuture(it)) "Ends ${Dates.short(it)}" else "Ended" },
            "Edited".takeIf { pin.editedAt != null },
            pin.distanceText?.takeIf { !pin.mine },
        )
        if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = LareaType.caption, color = c.secondaryText)
    }
}

@Composable
private fun PinMessageRow(message: PinMessage, mine: Boolean, ownerId: String?, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s, if (mine) Alignment.End else Alignment.Start),
        modifier = Modifier.fillMaxWidth(),
    ) {
        if (!mine) Avatar(message.author.displayName, message.author.id, size = 30.dp)
        Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (!mine) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(start = 6.dp)) {
                    Text(message.author.displayName, style = LareaType.caption.copy(fontWeight = FontWeight.SemiBold), color = AvatarPalette.colors[AvatarPalette.colorIndex(message.author.id)])
                    if (message.author.id == ownerId) Pill("Admin", style = PillStyle.Tint)
                }
            }
            Text(
                message.text,
                style = LareaType.body,
                color = if (mine) Color.White else c.text,
                modifier = modifier
                    .widthIn(max = 300.dp)
                    .background(if (mine) c.brandPrimary else c.card, RoundedCornerShape(20.dp))
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            )
            Text(Dates.time(message.createdAt), style = LareaType.caption2, color = c.tertiaryText, modifier = Modifier.padding(horizontal = 6.dp))
        }
    }
}
