package com.larea.app.feature.chat

import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.larea.app.core.DebugFlags
import com.larea.app.core.format.Dates
import com.larea.app.core.media.ImageUploader
import com.larea.app.core.media.PreparedImage
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.realtime.ConnectionState
import com.larea.app.ui.components.Banner
import com.larea.app.ui.components.BannerKind
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.ImageViewer
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.ReportReasons
import com.larea.app.ui.components.ReportSheet
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

/**
 * The chat screen. The session is owned by the app router so the heartbeat and socket subscription
 * survive tab switches; the tab bar is hidden while the chat is on screen.
 */
@Composable
fun ChatScreen(session: ChatSession, venueName: String, onLeft: () -> Unit, onBack: () -> Unit, pickImage: suspend (Uri) -> PreparedImage) {
    val state by session.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var draft by rememberSaveable { mutableStateOf("") }
    var attachment by remember { mutableStateOf<PreparedImage?>(null) }
    var pickError by remember { mutableStateOf<String?>(null) }
    var reporting by remember { mutableStateOf<ChatMessage?>(null) }
    var blocking by remember { mutableStateOf<ChatMessage?>(null) }
    var menuFor by remember { mutableStateOf<String?>(null) }
    var viewing by remember { mutableStateOf<ImageAttachment?>(null) }
    var showMembers by remember { mutableStateOf(false) }
    var showCreatePoll by remember { mutableStateOf(false) }
    val presenceText = if (state.presence == 1) "1 person here" else "${state.presence} people here"

    // Newest row first so the list stays anchored to the bottom (reverse layout).
    val rows = (buildChatRows(state.messages) + state.notices.map { ChatRow.Notice(it) } + state.pending.map { ChatRow.Pending(it) }).asReversed()
    val listState = rememberLazyListState()

    LaunchedEffect(state.left) { if (state.left) onLeft() }
    LaunchedEffect(state.sentCount) { if (state.sentCount > 0) haptics.performHapticFeedback(HapticFeedbackType.Confirm) }
    LaunchedEffect(state.removedCount) { if (state.removedCount > 0) haptics.performHapticFeedback(HapticFeedbackType.Reject) }
    // Pin to the newest row only when the user is already near the bottom.
    LaunchedEffect(rows.size) {
        if (listState.firstVisibleItemIndex <= 2 && rows.isNotEmpty()) listState.animateScrollToItem(0)
    }
    // Our own actions always bring the newest row into view, even from far up the history.
    LaunchedEffect(state.pending.size, state.sentCount, state.notices.size) {
        if (rows.isEmpty()) return@LaunchedEffect
        delay(80)
        listState.animateScrollToItem(0)
    }
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    fun attach(uri: Uri?) {
        uri ?: return
        scope.launch { runCatching { pickImage(uri) }.onSuccess { attachment = it }.onFailure { pickError = it.message ?: "That photo couldn't be read." } }
    }
    val libraryPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { attach(it) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) attach(cameraUri) }
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar(
            title = venueName,
            subtitle = presenceText,
            navigationIcon = {
                TextButton(onClick = session::leave, modifier = Modifier.testTag("chat.leave")) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(20.dp))
                    Text(" Leave", color = c.brandPrimary)
                }
            },
            actions = {
                TextButton(
                    onClick = { showMembers = true },
                    modifier = Modifier.testTag("chat.members").semantics { contentDescription = presenceText },
                ) {
                    Icon(Icons.Filled.People, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(20.dp))
                    Text(" ${state.presence}", color = c.brandPrimary)
                }
            },
        )
        if (state.connection != ConnectionState.Connected) Banner(BannerKind.Info, "Reconnecting…")
        if (state.weakGps) Banner(BannerKind.Warning, "Weak GPS signal. We may not be able to confirm you're still here.")
        if (state.isMuted) Banner(BannerKind.Danger, "You can't send messages until ${Dates.time(state.mutedUntil)}.")

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (rows.isEmpty() && !state.loading) {
                EmptyState(Icons.Filled.Forum, "Say hello", description = "Nobody has said anything yet. Start the conversation.", modifier = Modifier.padding(top = 80.dp))
            }
            LazyColumn(
                state = listState,
                reverseLayout = true,
                contentPadding = PaddingValues(horizontal = Spacing.m, vertical = Spacing.s),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.fillMaxSize().testTag("chat.list"),
            ) {
                items(rows, key = { it.key }) { row ->
                    Box(Modifier.animateItem()) {
                        when (row) {
                            is ChatRow.Separator -> SeparatorRow(row.timeMs)
                            is ChatRow.Message -> {
                                val mine = row.message.author.id == state.myUserId
                                Box {
                                    MessageRow(
                                        row.message, row.position, row.showHeader && !mine, mine,
                                        onOpenImage = { viewing = it },
                                        onLongPress = if (mine) null else ({ menuFor = row.message.id }),
                                    )
                                    MessageMenu(expanded = menuFor == row.message.id, onDismiss = { menuFor = null }, items = listOf(
                                        MenuAction("Report", Icons.Filled.Flag) { reporting = row.message },
                                        MenuAction("Block ${row.message.author.displayName}", Icons.Filled.PanTool, destructive = true) { blocking = row.message },
                                    ))
                                }
                            }
                            is ChatRow.Poll -> {
                                val message = row.message
                                val poll = message.poll
                                val mine = message.author.id == state.myUserId
                                if (poll != null) {
                                    Box {
                                        PollRow(message, poll, mine, onVote = { session.vote(message.id, it) }, onLongPress = { menuFor = message.id })
                                        MessageMenu(
                                            expanded = menuFor == message.id,
                                            onDismiss = { menuFor = null },
                                            items = if (mine) {
                                                if (poll.isClosed()) emptyList() else listOf(MenuAction("Close poll", Icons.Filled.StopCircle) { session.closePoll(message.id) })
                                            } else {
                                                listOf(
                                                    MenuAction("Report", Icons.Filled.Flag) { reporting = message },
                                                    MenuAction("Block ${message.author.displayName}", Icons.Filled.PanTool, destructive = true) { blocking = message },
                                                )
                                            },
                                        )
                                    }
                                } else {
                                    Bubble(message.text, mine, GroupPosition.Single, pending = false)
                                }
                            }
                            is ChatRow.Notice -> NoticeChip(row.notice)
                            is ChatRow.Pending -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                val image = row.pending.image
                                if (image != null) {
                                    ImageBubble(image.jpeg, image.width.toFloat() / image.height.coerceAtLeast(1), row.pending.text, mine = true, GroupPosition.Single, pending = true, uploading = row.pending.uploading)
                                } else {
                                    Bubble(row.pending.text, mine = true, GroupPosition.Single, pending = true)
                                }
                            }
                        }
                    }
                }
            }
        }

        Composer(
            draft = draft,
            onDraftChange = { draft = it.take(500) },
            attachment = attachment,
            onRemoveAttachment = { attachment = null },
            muted = state.isMuted,
            hasCamera = hasCamera,
            onLibrary = { libraryPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            onCamera = {
                val file = File(context.cacheDir, "camera").apply { mkdirs() }.resolve("photo-${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                cameraUri = uri
                camera.launch(uri)
            },
            onTestImage = if (DebugFlags.testSeedImage) ({ attachment = ImageUploader.testImage() }) else null,
            onCreatePoll = { showCreatePoll = true },
            onSend = {
                val text = draft
                val photo = attachment
                draft = ""
                attachment = null
                if (photo != null) session.sendImage(photo, text) else session.send(text)
            },
        )
    }

    viewing?.let { ImageViewer(it, onDismiss = { viewing = null }) }
    if (showMembers) {
        MembersSheet(
            venueId = session.venueId,
            myUserId = state.myUserId,
            onBlock = { member -> session.block(com.larea.app.core.network.Author(member.id, member.displayName)) },
            onDismiss = { showMembers = false },
        )
    }
    if (showCreatePoll) {
        CreatePollSheet(onDismiss = { showCreatePoll = false }) { poll ->
            showCreatePoll = false
            session.createPoll(poll)
        }
    }
    reporting?.let { message ->
        ReportSheet("Report message", ReportReasons.chat, onDismiss = { reporting = null }) { reason ->
            reporting = null
            session.report(message, reason)
        }
    }
    blocking?.let { message ->
        BlockDialog(message.author.displayName, onConfirm = { session.block(message.author); blocking = null }, onDismiss = { blocking = null })
    }
    state.removed?.let { RemovedSheet(it, onDone = onLeft) }
    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = session::dismissNotice,
            title = { Text("Something went wrong", style = LareaType.headline) },
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = session::dismissNotice) { Text("OK") } },
        )
    }
    pickError?.let { error ->
        AlertDialog(
            onDismissRequest = { pickError = null },
            title = { Text("Photo", style = LareaType.headline) },
            text = { Text(error) },
            confirmButton = { TextButton(onClick = { pickError = null }) { Text("OK") } },
        )
    }
}

data class MenuAction(val title: String, val icon: ImageVector, val destructive: Boolean = false, val onClick: () -> Unit)

@Composable
fun MessageMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<MenuAction>) {
    val c = Larea.colors
    DropdownMenu(expanded = expanded && items.isNotEmpty(), onDismissRequest = onDismiss, modifier = Modifier.exposeTestTags()) {
        items.forEach { item ->
            DropdownMenuItem(
                text = { Text(item.title, color = if (item.destructive) c.danger else c.text) },
                leadingIcon = { Icon(item.icon, contentDescription = null, tint = if (item.destructive) c.danger else c.secondaryText) },
                onClick = { onDismiss(); item.onClick() },
            )
        }
    }
}

@Composable
private fun Composer(
    draft: String,
    onDraftChange: (String) -> Unit,
    attachment: PreparedImage?,
    onRemoveAttachment: () -> Unit,
    muted: Boolean,
    hasCamera: Boolean,
    onLibrary: () -> Unit,
    onCamera: () -> Unit,
    onTestImage: (() -> Unit)?,
    onCreatePoll: () -> Unit,
    onSend: () -> Unit,
) {
    val c = Larea.colors
    var menu by remember { mutableStateOf(false) }
    val canSend = !muted && (attachment != null || draft.isNotBlank())
    val placeholder = when {
        muted -> "You're muted for now"
        attachment == null -> "Say something…"
        else -> "Add a caption…"
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .fillMaxWidth()
            .background(c.card)
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = Spacing.m, vertical = Spacing.s),
    ) {
        if (attachment != null) {
            Box(Modifier.size(72.dp).testTag("chat.attach.preview")) {
                AsyncImage(attachment.jpeg, contentDescription = "Photo to send", contentScale = ContentScale.Crop, modifier = Modifier.size(72.dp).clip(RoundedCornerShape(Radius.field)))
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(22.dp)
                        .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                        .clickable(onClick = onRemoveAttachment)
                        .semantics { contentDescription = "Remove photo" }
                        .testTag("chat.attach.remove"),
                ) { Icon(Icons.Filled.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp)) }
            }
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            Box {
                RoundIcon(Icons.Filled.Add, "Add photo or poll", c.brandPrimary, c.brandTint, enabled = !muted, tag = "chat.attach") { menu = true }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.exposeTestTags()) {
                    DropdownMenuItem(text = { Text("Photo library") }, leadingIcon = { Icon(Icons.Filled.PhotoLibrary, null) }, onClick = { menu = false; onLibrary() }, modifier = Modifier.testTag("chat.attach.library"))
                    if (hasCamera) DropdownMenuItem(text = { Text("Take photo") }, leadingIcon = { Icon(Icons.Filled.CameraAlt, null) }, onClick = { menu = false; onCamera() }, modifier = Modifier.testTag("chat.attach.camera"))
                    DropdownMenuItem(text = { Text("Create poll") }, leadingIcon = { Icon(Icons.Filled.BarChart, null) }, onClick = { menu = false; onCreatePoll() }, modifier = Modifier.testTag("chat.poll"))
                    if (onTestImage != null) DropdownMenuItem(text = { Text("Use test image") }, leadingIcon = { Icon(Icons.Filled.Science, null) }, onClick = { menu = false; onTestImage() }, modifier = Modifier.testTag("chat.attach.seed"))
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 38.dp)
                    .background(c.fill, RoundedCornerShape(Radius.bubble))
                    .padding(horizontal = 14.dp, vertical = 9.dp),
            ) {
                if (draft.isEmpty()) Text(placeholder, style = LareaType.body, color = c.tertiaryText)
                BasicTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    enabled = !muted,
                    maxLines = 5,
                    textStyle = LareaType.body.copy(color = c.text),
                    cursorBrush = SolidColor(c.brandPrimary),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.fillMaxWidth().testTag("chat.composer").semantics { contentDescription = "Message" },
                )
            }
            RoundIcon(Icons.Filled.ArrowUpward, "Send", Color.White, if (canSend) c.brandPrimary else c.fill, enabled = canSend, tag = "chat.send", onClick = onSend)
        }
        if (draft.length > 400) {
            Text(
                "${draft.length}/500",
                style = LareaType.caption2,
                color = if (draft.length >= 500) c.danger else c.secondaryText,
                modifier = Modifier.align(Alignment.End),
            )
        }
    }
}

@Composable
private fun RoundIcon(icon: ImageVector, label: String, tint: Color, background: Color, enabled: Boolean, tag: String, onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(38.dp)
            .background(background, CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = label }
            .testTag(tag),
    ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp)) }
}
