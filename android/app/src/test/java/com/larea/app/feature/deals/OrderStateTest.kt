package com.larea.app.feature.deals

import com.larea.app.core.network.Author
import com.larea.app.core.network.ListingSummary
import com.larea.app.core.network.Order
import com.larea.app.core.network.OrderStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Mirrors ios/LareaTests/OrderStateTests.swift. */
class OrderStateTest {
    @Test
    fun `primary actions`() {
        assertEquals(OrderAction.Pay, OrderState.primary(OrderStatus.AWAITING_PAYMENT, OrderRole.Payer))
        assertNull(OrderState.primary(OrderStatus.AWAITING_PAYMENT, OrderRole.Payee))
        assertEquals(OrderAction.ApproveHandover, OrderState.primary(OrderStatus.PAID, OrderRole.Payee))
        assertNull(OrderState.primary(OrderStatus.PAID, OrderRole.Payer))
        for (status in listOf(OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.DISPUTED, OrderStatus.UNKNOWN)) {
            assertNull(OrderState.primary(status, OrderRole.Payer))
            assertNull(OrderState.primary(status, OrderRole.Payee))
        }
    }

    @Test
    fun `secondary actions`() {
        assertEquals(listOf(OrderAction.Cancel), OrderState.secondary(OrderStatus.AWAITING_PAYMENT, OrderRole.Payer))
        assertEquals(listOf(OrderAction.Cancel), OrderState.secondary(OrderStatus.AWAITING_PAYMENT, OrderRole.Payee))
        assertEquals(listOf(OrderAction.CancelAndRefund), OrderState.secondary(OrderStatus.PAID, OrderRole.Payer))
        assertEquals(listOf(OrderAction.Cancel), OrderState.secondary(OrderStatus.PAID, OrderRole.Payee))
        assertEquals(emptyList<OrderAction>(), OrderState.secondary(OrderStatus.COMPLETED, OrderRole.Payer))
        assertEquals(emptyList<OrderAction>(), OrderState.secondary(OrderStatus.DISPUTED, OrderRole.Payee))
    }

    @Test
    fun `steps and waiting text`() {
        assertEquals(0, OrderState.stepIndex(OrderStatus.AWAITING_PAYMENT))
        assertEquals(1, OrderState.stepIndex(OrderStatus.PAID))
        assertEquals(3, OrderState.stepIndex(OrderStatus.COMPLETED))
        assertNull(OrderState.stepIndex(OrderStatus.REFUNDED))
        assertEquals("Waiting for ben to pay.", OrderState.waitingText(OrderStatus.AWAITING_PAYMENT, OrderRole.Payee, "ben"))
        assertNull(OrderState.waitingText(OrderStatus.COMPLETED, OrderRole.Payer, "ben"))
    }

    @Test
    fun `role follows my id, then the server's role`() {
        val order = Order(
            id = "o1", listing = ListingSummary("l1", "Desk"), payer = Author("u2", "ben"), payee = Author("u1", "anna"), role = "payer",
        )
        assertEquals(OrderRole.Payee, OrderState.role(order, myId = "u1"))
        assertEquals(OrderRole.Payer, OrderState.role(order, myId = null))
    }
}
