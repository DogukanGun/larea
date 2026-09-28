package com.larea.app.feature.chat

import com.larea.app.core.network.Author
import com.larea.app.core.network.ChatMessage
import com.larea.app.core.network.PollOptionView
import com.larea.app.core.network.PollView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** Mirrors ios/LareaTests/MessageGroupingTests.swift and PollDraftTests.swift. */
class ChatModelsTest {
    private fun message(id: String, author: String, atSeconds: Long, kind: String? = null) = ChatMessage(
        id = id, venueId = "v", author = Author(author, author), text = id, status = "APPROVED",
        createdAt = Instant.ofEpochSecond(1_800_000_000 + atSeconds).toString(), kindRaw = kind,
    )

    private fun positions(rows: List<ChatRow>) = rows.filterIsInstance<ChatRow.Message>()

    @Test
    fun `groups consecutive messages by the same author within the window`() {
        val rows = positions(buildChatRows(listOf(
            message("a1", "anna", 0), message("a2", "anna", 60), message("a3", "anna", 120),
            message("b1", "ben", 130), message("a4", "anna", 140),
        )))
        assertEquals(listOf("a1", "a2", "a3", "b1", "a4"), rows.map { it.message.id })
        assertEquals(listOf(GroupPosition.First, GroupPosition.Middle, GroupPosition.Last, GroupPosition.Single, GroupPosition.Single), rows.map { it.position })
        assertEquals(listOf(true, false, false, true, true), rows.map { it.showHeader })
    }

    @Test
    fun `splits a group after five minutes`() {
        val rows = positions(buildChatRows(listOf(message("a1", "anna", 0), message("a2", "anna", 6 * 60))))
        assertEquals(listOf(GroupPosition.Single, GroupPosition.Single), rows.map { it.position })
    }

    @Test
    fun `inserts a separator at the start and after an hour gap`() {
        val rows = buildChatRows(listOf(message("a1", "anna", 0), message("a2", "anna", 30), message("a3", "anna", 2 * 3600)))
        assertEquals(2, rows.count { it is ChatRow.Separator })
        assertEquals("sep-a1", rows.first().key)
    }

    @Test
    fun `polls stand alone and split their neighbours`() {
        val poll = message("p1", "anna", 30, kind = "POLL").copy(poll = PollView("poll", "Pizza?", listOf(PollOptionView("o1", "Yes"))))
        val rows = buildChatRows(listOf(message("a1", "anna", 0), poll, message("a2", "anna", 60)))
        assertEquals(listOf("sep-a1", "a1", "p1", "a2"), rows.map { it.key })
        assertEquals(GroupPosition.Single, (rows[1] as ChatRow.Message).position)
        assertEquals(true, rows[2] is ChatRow.Poll)
        assertEquals(GroupPosition.Single, (rows[3] as ChatRow.Message).position)
    }

    @Test
    fun `a valid poll draft passes and is cleaned`() {
        val draft = PollDraft(" Pizza or ramen? ", listOf("Pizza ", "", "Ramen"), PollDuration.Hour)
        assertNull(PollValidation.validate(draft))
        val clean = PollValidation.cleaned(draft)
        assertEquals("Pizza or ramen?", clean.question)
        assertEquals(listOf("Pizza", "Ramen"), clean.options)
        assertEquals(60, clean.duration.minutes)
    }

    @Test
    fun `poll problems are reported in order`() {
        assertEquals("Ask a question.", PollValidation.validate(PollDraft("", listOf("a", "b"))))
        assertEquals("Keep the question under 200 characters.", PollValidation.validate(PollDraft("q".repeat(201), listOf("a", "b"))))
        assertEquals("Add at least two options.", PollValidation.validate(PollDraft("Q?", listOf("only"))))
        assertEquals("At most 6 options.", PollValidation.validate(PollDraft("Q?", listOf("a", "b", "c", "d", "e", "f", "g"))))
        assertEquals("Keep each option under 60 characters.", PollValidation.validate(PollDraft("Q?", listOf("a", "b".repeat(61)))))
        assertEquals("Options must be different from each other.", PollValidation.validate(PollDraft("Q?", listOf("Same", "same"))))
    }
}
