package com.larea.app.feature.chat

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.larea.app.core.format.Dates
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.network.MessageKind
import com.larea.app.core.network.PollView
import com.larea.app.core.network.ReplyPreview
import com.larea.app.solana.LocalSolanaUi
import com.larea.app.ui.components.Avatar
import com.larea.app.ui.components.AvatarPalette
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PollBar
import com.larea.app.ui.components.RemoteImage
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import java.time.Instant
import kotlin.math.roundToInt
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Bubble corners: tight where a bubble joins the previous/next one from the same author. */
fun bubbleShape(mine: Boolean, position: GroupPosition): RoundedCornerShape {
    val big = Radius.bubble
    val small = 6.dp
    val joinedAbove = position == GroupPosition.Middle || position == GroupPosition.Last
    val joinedBelow = position == GroupPosition.First || position == GroupPosition.Middle
    return RoundedCornerShape(
        topStart = if (!mine && joinedAbove) small else big,
        topEnd = if (mine && joinedAbove) small else big,
        bottomEnd = if (mine && joinedBelow) small else big,
        bottomStart = if (!mine && joinedBelow) small else big,
    )
}

/** "14:05" today, otherwise "Monday 14:05". */
fun separatorText(timeMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    val time = Instant.ofEpochMilli(timeMs).atZone(zone)
    val clock = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).format(time)
    if (time.toLocalDate() == LocalDate.now(zone)) return clock
    return DateTimeFormatter.ofPattern("EEEE", Locale.getDefault()).format(time) + " " + clock
}

@Composable
fun SeparatorRow(timeMs: Long) {
    Text(
        separatorText(timeMs),
        style = LareaType.caption2.copy(fontWeight = FontWeight.SemiBold),
        color = Larea.colors.secondaryText,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.m),
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageRow(
    message: ChatMessage,
    position: GroupPosition,
    showHeader: Boolean,
    mine: Boolean,
    onOpenImage: (ImageAttachment) -> Unit,
    onLongPress: (() -> Unit)?,
    onReply: (() -> Unit)? = null,
    onQuote: (String) -> Unit = {},
    highlighted: Boolean = false,
) {
    val c = Larea.colors
    val quoted = message.replyTo?.takeIf { !it.unavailable }?.author?.let { "Reply to ${it.displayName}. " }.orEmpty()
    val description = quoted + if (message.kind == MessageKind.IMAGE) "Photo from ${message.author.displayName}. ${message.caption.orEmpty()}" else "${message.author.displayName}: ${message.text}"
    SwipeToReply(onReply, Modifier.padding(top = if (showHeader) Spacing.s else 0.dp)) { swipe ->
        Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = swipe
                .fillMaxWidth()
                .background(if (highlighted) c.brandTint else Color.Transparent, RoundedCornerShape(Radius.bubble))
                .semantics {
                    contentDescription = description
                    if (onReply != null) customActions = listOf(CustomAccessibilityAction("Reply") { onReply(); true })
                },
        ) {
            if (mine) {
                Spacer(Modifier.weight(1f).widthIn(min = 60.dp))
            } else if (position == GroupPosition.Single || position == GroupPosition.Last) {
                Avatar(message.author.displayName, message.author.id, size = 30.dp)
            } else {
                Spacer(Modifier.size(30.dp))
            }
            Column(horizontalAlignment = if (mine) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                if (showHeader) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(start = 6.dp)) {
                        Text(
                            message.author.displayName,
                            style = LareaType.caption.copy(fontWeight = FontWeight.SemiBold),
                            color = AvatarPalette.colors[AvatarPalette.colorIndex(message.author.id)],
                        )
                        LocalSolanaUi.current.AuthorBadge(message.authorLevel)
                    }
                }
                val press = Modifier.combinedClickable(onClick = {}, onLongClick = onLongPress, onLongClickLabel = "More actions")
                val image = message.image
                if (message.kind == MessageKind.IMAGE && image != null) {
                    ImageBubble(
                        model = image.thumbnailUrl,
                        aspectRatio = image.aspectRatio,
                        caption = message.caption.orEmpty(),
                        mine = mine,
                        position = position,
                        pending = false,
                        uploading = false,
                        modifier = Modifier.testTag("chat.image.${message.id}"),
                        onOpen = { onOpenImage(image) },
                        onLongPress = onLongPress,
                        replyTo = message.replyTo,
                        onQuote = onQuote,
                    )
                } else {
                    Bubble(message.text, mine, position, pending = false, modifier = if (onLongPress != null) press else Modifier, replyTo = message.replyTo, onQuote = onQuote)
                }
                if (position == GroupPosition.Single || position == GroupPosition.Last) {
                    Text(Dates.time(message.createdAt), style = LareaType.caption2, color = c.tertiaryText, modifier = Modifier.padding(horizontal = 6.dp))
                }
            }
            if (!mine) Spacer(Modifier.weight(1f).widthIn(min = 60.dp))
        }
    }
}

/**
 * Swipe a message to the right to answer it: the row follows the finger, a reply arrow fades in,
 * and letting go past the threshold starts the reply. Horizontal only, so the list keeps scrolling.
 */
@Composable
private fun SwipeToReply(onReply: (() -> Unit)?, modifier: Modifier = Modifier, content: @Composable (Modifier) -> Unit) {
    val c = Larea.colors
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val trigger = with(density) { 56.dp.toPx() }
    val limit = with(density) { 72.dp.toPx() }
    var dx by remember { mutableFloatStateOf(0f) }
    var armed by remember { mutableStateOf(false) }
    val drag = rememberDraggableState { delta ->
        dx = (dx + delta * 0.8f).coerceIn(0f, limit)
        val now = dx >= trigger
        if (now != armed) {
            armed = now
            if (now) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
    Box(
        modifier.draggable(
            state = drag,
            orientation = Orientation.Horizontal,
            enabled = onReply != null,
            onDragStopped = {
                if (armed) onReply?.invoke()
                armed = false
                animate(dx, 0f, animationSpec = spring()) { value, _ -> dx = value }
            },
        ),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (dx > 0f) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(30.dp)
                    .alpha((dx / trigger).coerceIn(0f, 1f))
                    .background(c.brandTint, CircleShape),
            ) { Icon(Icons.AutoMirrored.Filled.Reply, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(18.dp)) }
        }
        content(Modifier.offset { IntOffset(dx.roundToInt(), 0) })
    }
}

/** The quoted message at the top of a reply; tap to jump to it. */
@Composable
fun QuoteBlock(quote: ReplyPreview, mine: Boolean, onClick: (() -> Unit)? = null) {
    val c = Larea.colors
    val accent = if (mine) Color.White else quote.author?.let { AvatarPalette.colors[AvatarPalette.colorIndex(it.id)] } ?: c.secondaryText
    val textColor = if (mine) Color.White.copy(alpha = 0.85f) else c.secondaryText
    val label = if (quote.unavailable) "Reply to a message that is no longer available" else "Reply to ${quote.author?.displayName.orEmpty()}: ${quote.text.orEmpty()}"
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(10.dp))
            .background(if (mine) Color.White.copy(alpha = 0.18f) else c.fill)
            .then(if (onClick != null) Modifier.clickable(onClickLabel = "Show message", onClick = onClick) else Modifier)
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .testTag("chat.reply.${quote.id}"),
    ) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(accent, RoundedCornerShape(2.dp)))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            if (quote.unavailable) {
                Text("Message unavailable", style = LareaType.caption.copy(fontStyle = FontStyle.Italic), color = textColor)
            } else {
                Text(quote.author?.displayName.orEmpty(), style = LareaType.caption.copy(fontWeight = FontWeight.SemiBold), color = accent, maxLines = 1)
                Text(quote.text.orEmpty(), style = LareaType.caption, color = textColor, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
fun Bubble(
    text: String,
    mine: Boolean,
    position: GroupPosition,
    pending: Boolean,
    modifier: Modifier = Modifier,
    replyTo: ReplyPreview? = null,
    onQuote: (String) -> Unit = {},
) {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier
            .widthIn(max = 300.dp)
            .alpha(if (pending) 0.55f else 1f)
            .clip(bubbleShape(mine, position))
            .background(if (mine) c.brandPrimary else c.card)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) {
        if (replyTo != null) QuoteBlock(replyTo, mine, onClick = if (pending) null else ({ onQuote(replyTo.id) }))
        Text(text, style = LareaType.body, color = if (mine) Color.White else c.text)
    }
}

/** A photo message: thumbnail sized by its aspect ratio, optional caption, tap to view. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ImageBubble(
    model: Any?,
    aspectRatio: Float,
    caption: String,
    mine: Boolean,
    position: GroupPosition,
    pending: Boolean,
    uploading: Boolean,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit = {},
    onLongPress: (() -> Unit)? = null,
    replyTo: ReplyPreview? = null,
    onQuote: (String) -> Unit = {},
) {
    val c = Larea.colors
    val width = 240.dp
    val height = (240f / aspectRatio.coerceAtLeast(0.2f)).coerceIn(120f, 320f).dp
    Column(
        modifier
            .width(width)
            .alpha(if (pending) 0.55f else 1f)
            .clip(bubbleShape(mine, position))
            .background(if (mine) c.brandPrimary else c.card)
            .combinedClickable(onClick = onOpen, onLongClick = onLongPress, onClickLabel = "Open photo")
            .semantics(mergeDescendants = true) { contentDescription = if (caption.isEmpty()) "Photo" else "Photo, $caption" },
    ) {
        if (replyTo != null) {
            Box(Modifier.padding(6.dp)) { QuoteBlock(replyTo, mine, onClick = if (pending) null else ({ onQuote(replyTo.id) })) }
        }
        Box(Modifier.width(width).height(height), contentAlignment = Alignment.Center) {
            when (model) {
                is String -> RemoteImage(model, Modifier.width(width).height(height))
                null -> RemoteImage(null, Modifier.width(width).height(height))
                else -> AsyncImage(model = model, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.width(width).height(height))
            }
            if (uploading) {
                Box(Modifier.size(44.dp).background(Color.Black.copy(alpha = 0.35f), CircleShape), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
                }
            }
        }
        if (caption.isNotEmpty()) {
            Text(caption, style = LareaType.body, color = if (mine) Color.White else c.text, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
        }
    }
}

/** "anna tipped ben 2 USDC", centred between the bubbles. */
@Composable
fun TipChip(message: ChatMessage) {
    val c = Larea.colors
    Box(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), contentAlignment = Alignment.Center) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(c.brandTint)
                .padding(horizontal = Spacing.m, vertical = 6.dp)
                .testTag("chat.tip.${message.id}"),
        ) {
            Icon(Icons.Filled.Paid, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(16.dp))
            Text(message.text, style = LareaType.footnote.copy(fontWeight = FontWeight.SemiBold), color = c.text)
        }
    }
}

@Composable
fun NoticeChip(notice: SystemNotice) {
    val c = Larea.colors
    val icon = when (notice.kind) {
        SystemNotice.Kind.Blocked -> Icons.Filled.PanTool
        SystemNotice.Kind.Censored -> Icons.Filled.VisibilityOff
        SystemNotice.Kind.Warned -> Icons.AutoMirrored.Filled.Chat
        SystemNotice.Kind.Info -> Icons.Filled.Info
    }
    Box(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), contentAlignment = Alignment.Center) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.background(c.fill, CircleShape).padding(horizontal = Spacing.m, vertical = 6.dp),
        ) {
            Icon(icon, contentDescription = null, tint = c.secondaryText, modifier = Modifier.size(14.dp))
            Text(notice.text, style = LareaType.caption, color = c.secondaryText, textAlign = TextAlign.Center)
        }
    }
}

/** A poll in the timeline: question, one bar per option, live counts. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PollRow(message: ChatMessage, poll: PollView, mine: Boolean, onVote: (String) -> Unit, onLongPress: (() -> Unit)?) {
    val c = Larea.colors
    val closed = poll.isClosed()
    val showResults = poll.myOptionId != null || closed
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.xs)) {
        if (mine) Spacer(Modifier.weight(1f).widthIn(min = 40.dp)) else Avatar(message.author.displayName, message.author.id, size = 30.dp)
        Column(
            verticalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(RoundedCornerShape(Radius.card))
                .background(c.card)
                .border(if (mine) 2.dp else 0.dp, if (mine) c.brandTint else Color.Transparent, RoundedCornerShape(Radius.card))
                .combinedClickable(onClick = {}, onLongClick = onLongPress)
                .padding(Spacing.m),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                Icon(Icons.Filled.BarChart, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(18.dp))
                Text(
                    if (mine) "Your poll" else message.author.displayName,
                    style = LareaType.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = if (mine) c.brandPrimary else AvatarPalette.colors[AvatarPalette.colorIndex(message.author.id)],
                )
                if (!mine) LocalSolanaUi.current.AuthorBadge(message.authorLevel)
                Spacer(Modifier.weight(1f))
                if (closed) Pill("Closed", style = PillStyle.Neutral)
            }
            Text(poll.question, style = LareaType.headline, color = c.text)
            poll.options.forEach { option ->
                PollBar(
                    text = option.text,
                    fraction = if (poll.totalVotes > 0) option.votes.toFloat() / poll.totalVotes else 0f,
                    percent = poll.percent(option),
                    selected = option.id == poll.myOptionId,
                    showResults = showResults,
                    enabled = !closed,
                    onClick = { onVote(option.id) },
                    modifier = Modifier.testTag("poll.${message.id}.option.${option.id}"),
                )
            }
            Text(pollFooter(poll, showResults), style = LareaType.caption, color = c.secondaryText)
        }
        if (!mine) Spacer(Modifier.weight(1f).widthIn(min = 40.dp))
    }
}

fun pollFooter(poll: PollView, showResults: Boolean): String {
    val votes = if (poll.totalVotes == 1) "1 vote" else "${poll.totalVotes} votes"
    if (poll.isClosed()) return "Final results · $votes"
    if (poll.closesAt != null && Dates.parseMillis(poll.closesAt) != null) return "$votes · closes ${Dates.relative(poll.closesAt)}"
    return if (showResults) votes else "$votes · tap to vote"
}
