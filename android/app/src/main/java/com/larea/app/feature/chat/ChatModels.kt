package com.larea.app.feature.chat

import com.larea.app.core.format.Dates
import com.larea.app.core.media.PreparedImage
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.MessageKind

/** A message on its way to the server, shown dimmed until it comes back. */
data class PendingMessage(val id: String, val text: String, val image: PreparedImage? = null, val uploading: Boolean = false)

data class SystemNotice(val id: String, val kind: Kind, val text: String) {
    enum class Kind { Blocked, Censored, Warned, Info }
}

enum class GroupPosition { Single, First, Middle, Last }

sealed interface ChatRow {
    val key: String

    data class Separator(val messageId: String, val timeMs: Long) : ChatRow {
        override val key get() = "sep-$messageId"
    }

    data class Message(val message: ChatMessage, val position: GroupPosition, val showHeader: Boolean) : ChatRow {
        override val key get() = message.id
    }

    /** A poll stands on its own: it never groups with the bubbles around it. */
    data class Poll(val message: ChatMessage) : ChatRow {
        override val key get() = message.id
    }

    data class Notice(val notice: SystemNotice) : ChatRow {
        override val key get() = "notice-${notice.id}"
    }

    data class Pending(val pending: PendingMessage) : ChatRow {
        override val key get() = "pending-${pending.id}"
    }
}

/**
 * Groups consecutive messages by the same author within `groupWindowMs` and inserts a time separator
 * wherever the gap between messages is at least `separatorGapMs` (same rules as iOS `buildChatRows`).
 */
fun buildChatRows(
    messages: List<ChatMessage>,
    groupWindowMs: Long = 5 * 60_000L,
    separatorGapMs: Long = 60 * 60_000L,
): List<ChatRow> {
    val rows = mutableListOf<ChatRow>()
    val dated = messages.map { it to (Dates.parseMillis(it.createdAt) ?: 0L) }
    dated.forEachIndexed { index, (message, time) ->
        val previous = dated.getOrNull(index - 1)
        val next = dated.getOrNull(index + 1)
        val gapBefore = previous?.let { time - it.second }
        if (index == 0 || (gapBefore ?: 0) >= separatorGapMs) rows += ChatRow.Separator(message.id, time)
        if (message.kind == MessageKind.POLL) {
            rows += ChatRow.Poll(message)
            return@forEachIndexed
        }
        val withPrevious = previous != null && previous.first.kind != MessageKind.POLL && previous.first.author.id == message.author.id &&
            gapBefore!! < groupWindowMs && gapBefore < separatorGapMs
        val gapAfter = next?.let { it.second - time }
        val withNext = next != null && next.first.kind != MessageKind.POLL && next.first.author.id == message.author.id &&
            gapAfter!! < groupWindowMs && gapAfter < separatorGapMs
        val position = when {
            !withPrevious && !withNext -> GroupPosition.Single
            !withPrevious -> GroupPosition.First
            withNext -> GroupPosition.Middle
            else -> GroupPosition.Last
        }
        rows += ChatRow.Message(message, position, showHeader = !withPrevious)
    }
    return rows
}

enum class PollDuration(val minutes: Int?, val label: String) {
    None(null, "Until closed"), Hour(60, "1 hour"), SixHours(360, "6 hours"), Day(1440, "1 day")
}

data class PollDraft(val question: String = "", val options: List<String> = listOf("", ""), val duration: PollDuration = PollDuration.None)

/** Mirrors the backend's limits so the sheet can explain problems before sending. */
object PollValidation {
    const val QUESTION_MAX = 200
    const val OPTION_MAX = 60
    const val MIN_OPTIONS = 2
    const val MAX_OPTIONS = 6

    fun cleaned(draft: PollDraft) = draft.copy(
        question = draft.question.trim(),
        options = draft.options.map { it.trim() }.filter { it.isNotEmpty() },
    )

    /** null when the draft can be sent, otherwise the first problem to fix. */
    fun validate(draft: PollDraft): String? {
        val clean = cleaned(draft)
        return when {
            clean.question.isEmpty() -> "Ask a question."
            clean.question.length > QUESTION_MAX -> "Keep the question under $QUESTION_MAX characters."
            clean.options.size < MIN_OPTIONS -> "Add at least two options."
            clean.options.size > MAX_OPTIONS -> "At most $MAX_OPTIONS options."
            clean.options.any { it.length > OPTION_MAX } -> "Keep each option under $OPTION_MAX characters."
            clean.options.map { it.lowercase() }.toSet().size != clean.options.size -> "Options must be different from each other."
            else -> null
        }
    }
}
