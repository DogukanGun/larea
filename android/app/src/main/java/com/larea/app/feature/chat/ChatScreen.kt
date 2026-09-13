package com.larea.app.feature.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.R
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.realtime.ConnectionState
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val timeFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(venueName: String, onLeft: () -> Unit, viewModel: ChatViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var draft by rememberSaveable { mutableStateOf("") }
    var reporting by remember { mutableStateOf<ChatMessage?>(null) }

    LaunchedEffect(Unit) { viewModel.start() }
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ChatEvent.Notice -> snackbar.showSnackbar(event.text)
                ChatEvent.Left -> onLeft()
            }
        }
    }

    state.removed?.let { message ->
        AlertDialog(
            onDismissRequest = onLeft,
            title = { Text(stringResource(R.string.chat_removed_title)) },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = onLeft) { Text(stringResource(R.string.common_ok)) } },
        )
    }

    reporting?.let { message ->
        ReportSheet(onDismiss = { reporting = null }, onReport = { reason -> viewModel.report(message.id, reason); reporting = null })
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.chat_header, venueName, stringResource(R.string.nearby_general_chat)), style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.chat_presence, state.presence), style = MaterialTheme.typography.bodySmall)
                    }
                },
                navigationIcon = { IconButton(onClick = { viewModel.leave() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_leave)) } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            if (state.connection != ConnectionState.Connected) Banner(stringResource(R.string.chat_reconnecting))
            if (state.weakGps) Banner(stringResource(R.string.chat_weak_gps))

            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                reverseLayout = true,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(state.pending.reversed(), key = { "p-" + it.clientKey }) { p ->
                    MessageBubble(text = p.text, author = null, time = "…", mine = true, pending = true, onLongPress = null)
                }
                items(state.messages.reversed(), key = { it.id }) { m ->
                    val mine = m.author.id == state.myUserId
                    var menu by remember(m.id) { mutableStateOf(false) }
                    Box {
                        MessageBubble(
                            text = m.text, author = if (mine) null else m.author.displayName, time = formatTime(m.createdAt),
                            mine = mine, pending = false, onLongPress = if (mine) null else ({ menu = true }),
                        )
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(text = { Text(stringResource(R.string.chat_report)) }, onClick = { menu = false; reporting = m })
                            DropdownMenuItem(text = { Text(stringResource(R.string.chat_block, m.author.displayName)) }, onClick = { menu = false; viewModel.block(m.author.id, m.author.displayName) })
                        }
                    }
                }
                if (state.messages.isEmpty() && state.pending.isEmpty() && !state.loading) {
                    item { Text(stringResource(R.string.chat_empty), modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }

            val muted = state.mutedUntil?.let { runCatching { Instant.parse(it).isAfter(Instant.now()) }.getOrDefault(false) } == true
            if (muted) Banner(stringResource(R.string.chat_muted_until, formatTime(state.mutedUntil!!)))
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = draft, onValueChange = { if (it.length <= 500) draft = it },
                    placeholder = { Text(stringResource(R.string.chat_placeholder)) },
                    modifier = Modifier.weight(1f), maxLines = 4, enabled = !muted,
                )
                IconButton(onClick = { viewModel.send(draft); draft = "" }, enabled = draft.isNotBlank() && !muted) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.chat_send))
                }
            }
        }
    }
}

@Composable
private fun Banner(text: String) {
    Text(
        text, modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer).padding(horizontal = 16.dp, vertical = 8.dp),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer,
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(text: String, author: String?, time: String, mine: Boolean, pending: Boolean, onLongPress: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .background(
                    if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(16.dp),
                )
                .combinedClickable(enabled = onLongPress != null, onClick = {}, onLongClick = onLongPress)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (author != null) Text(author, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(text, style = MaterialTheme.typography.bodyLarge, color = if (pending) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
            Text(time, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportSheet(onDismiss: () -> Unit, onReport: (String) -> Unit) {
    val reasons = listOf(
        "HARASSMENT" to R.string.report_harassment, "THREAT" to R.string.report_threat, "HATE" to R.string.report_hate,
        "SEXUAL" to R.string.report_sexual, "SPAM" to R.string.report_spam, "SCAM" to R.string.report_scam,
        "PERSONAL_INFO" to R.string.report_personal_info, "OTHER" to R.string.report_other,
    )
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(bottom = 24.dp)) {
            Text(stringResource(R.string.report_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(16.dp))
            reasons.forEach { (code, label) ->
                TextButton(onClick = { onReport(code) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(label)) }
            }
        }
    }
}

private fun formatTime(iso: String): String =
    runCatching { timeFormat.format(Instant.parse(iso).atZone(ZoneId.systemDefault())) }.getOrDefault("")
