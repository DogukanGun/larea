package com.larea.app.feature.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.larea.app.core.format.Dates
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.network.MessageKind
import com.larea.app.core.network.PollView
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
) {
    val c = Larea.colors
    val description = if (message.kind == MessageKind.IMAGE) "Photo from ${message.author.displayName}. ${message.caption.orEmpty()}" else "${message.author.displayName}: ${message.text}"
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (showHeader) Spacing.s else 0.dp)
            .semantics { contentDescription = description },
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
                )
            } else {
                Bubble(message.text, mine, position, pending = false, modifier = if (onLongPress != null) press else Modifier)
            }
            if (position == GroupPosition.Single || position == GroupPosition.Last) {
                Text(Dates.time(message.createdAt), style = LareaType.caption2, color = c.tertiaryText, modifier = Modifier.padding(horizontal = 6.dp))
            }
        }
        if (!mine) Spacer(Modifier.weight(1f).widthIn(min = 60.dp))
    }
}

@Composable
fun Bubble(text: String, mine: Boolean, position: GroupPosition, pending: Boolean, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Text(
        text,
        style = LareaType.body,
        color = if (mine) Color.White else c.text,
        modifier = modifier
            .widthIn(max = 300.dp)
            .alpha(if (pending) 0.55f else 1f)
            .clip(bubbleShape(mine, position))
            .background(if (mine) c.brandPrimary else c.card)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    )
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
