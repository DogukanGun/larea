package com.larea.app.feature.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Member
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.apiCode
import com.larea.app.core.network.userMessage
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.core.realtime.ServerEvent
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.HeroGlyph
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.MemberRow
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** The "block this person?" confirmation shared by the chat, the members list and listings. */
@Composable
fun BlockDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Block $name?", style = LareaType.headline) },
        text = { Text("You won't see each other's messages. They won't be told.") },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Block", color = Larea.colors.danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Shown when the server removed us; it can only be left through the button. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RemovedSheet(message: String, onDone: () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { false })
    ModalBottomSheet(
        onDismissRequest = {},
        sheetState = state,
        containerColor = Larea.colors.background,
        dragHandle = null,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.l),
            modifier = Modifier.exposeTestTags().fillMaxWidth().navigationBarsPadding().padding(horizontal = Spacing.screen).padding(top = Spacing.xl, bottom = Spacing.xl),
        ) {
            HeroGlyph(Icons.AutoMirrored.Filled.DirectionsWalk)
            Text("You've left the area", style = LareaType.title2, color = Larea.colors.text)
            Text(message, style = LareaType.body, color = Larea.colors.secondaryText, textAlign = TextAlign.Center)
            PrimaryButton("Back to nearby chats", onClick = onDone, tag = "chat.removed.done")
        }
    }
}

/** Question, two to six options and an optional duration; posts into the current chat. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatePollSheet(onDismiss: () -> Unit, onSubmit: (PollDraft) -> Unit) {
    val c = Larea.colors
    var draft by remember { mutableStateOf(PollDraft()) }
    var attempted by remember { mutableStateOf(false) }
    val problem = PollValidation.validate(draft)
    val focusers = remember { List(PollValidation.MAX_OPTIONS) { FocusRequester() } }
    var focusIndex by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(focusIndex) { focusIndex?.let { runCatching { focusers[it].requestFocus() } } }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.grouped) {
        Column(Modifier.exposeTestTags().fillMaxWidth().imePadding().navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s)) {
                TextButton(onClick = onDismiss) { Text("Cancel") }
                Text("New poll", style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                TextButton(
                    onClick = {
                        attempted = true
                        if (problem == null) onSubmit(PollValidation.cleaned(draft))
                    },
                    modifier = Modifier.testTag("poll.submit"),
                ) { Text("Post", fontWeight = FontWeight.SemiBold) }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Spacing.xl)) {
                SectionHeader("Question")
                GroupedCard {
                    Box(Modifier.padding(Spacing.m)) {
                        LareaField(
                            "Question", draft.question, { draft = draft.copy(question = it) },
                            placeholder = "What do you want to ask?", singleLine = false, maxLines = 3, tag = "poll.question",
                        )
                    }
                }
                SectionHeader("Options")
                GroupedCard {
                    draft.options.forEachIndexed { index, option ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = Spacing.m, end = Spacing.xs, top = 6.dp, bottom = 6.dp)) {
                            LareaField(
                                "Option ${index + 1}", option,
                                { value -> draft = draft.copy(options = draft.options.mapIndexed { i, o -> if (i == index) value else o }) },
                                focusRequester = focusers[index], tag = "poll.option.$index", modifier = Modifier.weight(1f),
                                onSubmit = { if (index < draft.options.lastIndex) focusIndex = index + 1 },
                            )
                            if (draft.options.size > PollValidation.MIN_OPTIONS) {
                                IconButton(onClick = { draft = draft.copy(options = draft.options.filterIndexed { i, _ -> i != index }) }) {
                                    Icon(Icons.Filled.Close, contentDescription = "Remove option ${index + 1}", tint = c.secondaryText)
                                }
                            }
                        }
                    }
                    if (draft.options.size < PollValidation.MAX_OPTIONS) {
                        RowDivider()
                        TextButton(
                            onClick = {
                                draft = draft.copy(options = draft.options + "")
                                focusIndex = draft.options.lastIndex
                            },
                            modifier = Modifier.padding(horizontal = Spacing.s).testTag("poll.addOption"),
                        ) {
                            Icon(Icons.Filled.AddCircle, contentDescription = null, modifier = Modifier.size(20.dp))
                            Text("  Add option")
                        }
                    }
                }
                SectionFooter("Everyone in the chat can vote once and change their mind while the poll is open.")
                SectionHeader("Closes")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = Spacing.screen).testTag("poll.duration")) {
                    PollDuration.entries.forEachIndexed { index, duration ->
                        SegmentedButton(
                            selected = draft.duration == duration,
                            onClick = { draft = draft.copy(duration = duration) },
                            shape = SegmentedButtonDefaults.itemShape(index, PollDuration.entries.size),
                            colors = SegmentedButtonDefaults.colors(activeContainerColor = c.brandTint, activeContentColor = c.brandDeep),
                            icon = {},
                        ) { Text(duration.label, style = LareaType.caption, maxLines = 1) }
                    }
                }
                if (attempted && problem != null) InlineError(problem, Modifier.padding(Spacing.screen))
            }
        }
    }
}

data class MembersUiState(val members: List<Member> = emptyList(), val count: Int = 0, val loading: Boolean = true, val error: String? = null, val gone: Boolean = false)

@HiltViewModel
class MembersViewModel @Inject constructor(private val api: LareaApi, private val realtime: RealtimeClient) : ViewModel() {
    private val _state = MutableStateFlow(MembersUiState())
    val state: StateFlow<MembersUiState> = _state
    private var reload: Job? = null
    private var venueId: String? = null

    /** Loads the members and refetches 500 ms after the head count changes. */
    fun start(venueId: String) {
        if (this.venueId != null) return
        this.venueId = venueId
        viewModelScope.launch { load() }
        viewModelScope.launch {
            realtime.events.collect { event ->
                if (event is ServerEvent.Presence && event.venueId == venueId) {
                    reload?.cancel()
                    reload = launch { delay(500); load() }
                }
            }
        }
    }

    fun retry() {
        viewModelScope.launch { load() }
    }

    fun removed(id: String) = _state.update { s -> s.copy(members = s.members.filterNot { it.id == id }) }

    private suspend fun load() {
        val venueId = venueId ?: return
        apiCall { api.members(venueId) }
            .onSuccess { r -> _state.update { it.copy(members = r.members, count = r.count, error = null, loading = false) } }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage(), loading = false, gone = e.apiCode == "NOT_MEMBER") } }
    }
}

/** Who is in the chat right now. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MembersSheet(venueId: String, myUserId: String?, onBlock: (Member) -> Unit, onDismiss: () -> Unit, model: MembersViewModel = hiltViewModel(key = "members-$venueId")) {
    val c = Larea.colors
    val state by model.state.collectAsStateWithLifecycle()
    var menuFor by remember { mutableStateOf<Member?>(null) }
    var blocking by remember { mutableStateOf<Member?>(null) }
    LaunchedEffect(venueId) { model.start(venueId) }
    LaunchedEffect(state.gone) { if (state.gone) onDismiss() }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.grouped) {
        Column(Modifier.exposeTestTags().fillMaxWidth().navigationBarsPadding().padding(bottom = Spacing.l)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(start = Spacing.screen, end = Spacing.s)) {
                Text(if (state.count == 1) "1 person here" else "${state.count} people here", style = LareaType.headline, color = c.text, modifier = Modifier.weight(1f))
                TextButton(onClick = onDismiss, modifier = Modifier.testTag("members.done")) { Text("Done", fontWeight = FontWeight.SemiBold) }
            }
            GroupedCard(Modifier.padding(top = Spacing.s)) {
                when {
                    state.loading && state.members.isEmpty() -> repeat(3) {
                        Box(Modifier.padding(horizontal = Spacing.l, vertical = 12.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(36.dp).background(c.fill, CircleShape))
                                Box(Modifier.size(width = 140.dp, height = 14.dp).background(c.fill, RoundedCornerShape(4.dp)))
                            }
                        }
                    }
                    state.members.isEmpty() && state.error != null -> EmptyState(Icons.Filled.WifiOff, "Can't load people", description = state.error) {
                        Button(onClick = model::retry, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Retry") }
                    }
                    state.members.isEmpty() -> EmptyState(Icons.Filled.People, "Just you for now", description = "People who join this chat show up here.")
                    else -> state.members.forEachIndexed { index, member ->
                        Box {
                            MemberRow(
                                member.displayName,
                                member.id,
                                isMe = member.id == myUserId,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .combinedClickable(onClick = {}, onLongClick = { if (member.id != myUserId) menuFor = member })
                                    .padding(horizontal = Spacing.l, vertical = 8.dp)
                                    .testTag("members.row.${member.id}"),
                            )
                            DropdownMenu(expanded = menuFor == member, onDismissRequest = { menuFor = null }, modifier = Modifier.exposeTestTags()) {
                                DropdownMenuItem(text = { Text("Block ${member.displayName}", color = c.danger) }, onClick = { menuFor = null; blocking = member })
                            }
                        }
                        if (index < state.members.lastIndex) RowDivider(inset = 64)
                    }
                }
            }
            if (state.count > state.members.size && !state.loading) {
                SectionFooter("${state.count - state.members.size} more you can't see because of blocks.")
            }
        }
    }
    blocking?.let { member ->
        BlockDialog(member.displayName, onConfirm = {
            onBlock(member)
            model.removed(member.id)
            blocking = null
        }, onDismiss = { blocking = null })
    }
}

