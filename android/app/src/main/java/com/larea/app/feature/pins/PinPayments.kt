package com.larea.app.feature.pins

import android.app.Activity
import com.larea.app.core.network.MessagePin
import com.larea.app.core.network.PinQuote

/** How a purchase attempt ended. */
sealed interface PinPaymentOutcome {
    data class Activated(val pin: MessagePin) : PinPaymentOutcome
    data object Cancelled : PinPaymentOutcome
    /** Waiting for the payment to clear (Play: pending payment; Solana: still confirming). */
    data class Pending(val message: String) : PinPaymentOutcome
}

/**
 * Paying for a message pin. The `play` flavor uses Google Play Billing (one-time consumables); the
 * `solana` flavor pays the same amount in USDC from the user's wallet.
 */
interface PinPayments {
    /** The store's localized price for this quote, or null to show the server's USD price. */
    suspend fun priceLabel(quote: PinQuote): String?

    suspend fun pay(activity: Activity, quote: PinQuote, step: (String) -> Unit): Result<PinPaymentOutcome>

    /** Delivers purchases that completed while the app was away (call on start); returns pins that went live. */
    suspend fun recover(): List<MessagePin> = emptyList()
}
