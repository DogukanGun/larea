package com.larea.app.feature.deals

import com.larea.app.core.network.Order
import com.larea.app.core.network.OrderStatus

enum class OrderRole { Payer, Payee }

enum class OrderAction(val title: String) {
    Pay("Pay now"), Cancel("Cancel deal"), ApproveHandover("Confirm handover"), CancelAndRefund("Cancel and refund")
}

/** Which buttons a deal shows, by status and side. Pure, so it is unit-tested (same table as iOS). */
object OrderState {
    fun role(order: Order, myId: String?): OrderRole {
        if (myId != null && order.payee.id == myId) return OrderRole.Payee
        return if (order.isPayer) OrderRole.Payer else OrderRole.Payee
    }

    fun primary(status: OrderStatus, role: OrderRole): OrderAction? = when {
        status == OrderStatus.AWAITING_PAYMENT && role == OrderRole.Payer -> OrderAction.Pay
        status == OrderStatus.PAID && role == OrderRole.Payee -> OrderAction.ApproveHandover
        else -> null
    }

    fun secondary(status: OrderStatus, role: OrderRole): List<OrderAction> = when {
        status == OrderStatus.AWAITING_PAYMENT -> listOf(OrderAction.Cancel)
        status == OrderStatus.PAID && role == OrderRole.Payer -> listOf(OrderAction.CancelAndRefund)
        status == OrderStatus.PAID -> listOf(OrderAction.Cancel)
        else -> emptyList()
    }

    val steps = listOf("Offer accepted", "Paid", "Handover", "Done")

    /** Index into [steps]; null when the deal ended without completing. */
    fun stepIndex(status: OrderStatus): Int? = when (status) {
        OrderStatus.AWAITING_PAYMENT -> 0
        OrderStatus.PAID -> 1
        OrderStatus.DISPUTED -> 2
        OrderStatus.COMPLETED -> 3
        else -> null
    }

    fun waitingText(status: OrderStatus, role: OrderRole, counterpart: String): String? = when {
        status == OrderStatus.AWAITING_PAYMENT && role == OrderRole.Payee -> "Waiting for $counterpart to pay."
        status == OrderStatus.AWAITING_PAYMENT -> "Pay to reserve the deal. The seller only gets the money after the handover."
        status == OrderStatus.PAID && role == OrderRole.Payer -> "Show your handover code to $counterpart when you meet. That releases the money."
        status == OrderStatus.PAID -> "Meet $counterpart, then enter their code to receive the money."
        status == OrderStatus.DISPUTED -> "The payment is being reviewed. A moderator will settle this deal."
        else -> null
    }

    fun reasonText(reason: String): String = when (reason) {
        "payer_cancelled" -> "Cancelled by the buyer"
        "payee_cancelled" -> "Cancelled by the seller"
        "payment_timeout" -> "Payment window closed"
        "auto_refund" -> "No handover in time"
        "late_payment" -> "Paid after cancelling"
        "listing_removed" -> "Listing removed"
        "moderator" -> "Settled by a moderator"
        else -> reason.replace('_', ' ')
    }
}
