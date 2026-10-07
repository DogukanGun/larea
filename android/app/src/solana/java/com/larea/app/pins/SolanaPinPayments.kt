package com.larea.app.pins

import android.app.Activity
import android.util.Base64
import com.larea.app.core.network.PinQuote
import com.larea.app.core.network.apiCall
import com.larea.app.feature.pins.PinPaymentOutcome
import com.larea.app.feature.pins.PinPayments
import com.larea.app.solana.SolanaApi
import com.larea.app.solana.SubmitStampRequest
import com.larea.app.solana.WalletAdapter
import com.larea.app.solana.submitSigned
import kotlinx.coroutines.delay
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The dApp Store build pays for a pin in USDC: Larea builds a transfer of the tier's price from the
 * user's wallet, the wallet signs, and the pin goes live once the transfer lands (as with USDC deals).
 */
@Singleton
class SolanaPinPayments @Inject constructor(
    private val api: SolanaApi,
    private val adapter: WalletAdapter,
) : PinPayments {
    override suspend fun priceLabel(quote: PinQuote): String = "${quote.priceUsd} USDC"

    override suspend fun pay(activity: Activity, quote: PinQuote, step: (String) -> Unit): Result<PinPaymentOutcome> = runCatching {
        step("Preparing the payment…")
        val payment = apiCall { api.payPin(quote.pin.id) }.getOrThrow()
        adapter.useCluster(payment.cluster)
        step("Approve ${payment.amount} USDC in your wallet…")
        val signed = adapter.signTransactions(listOf(Base64.decode(payment.transaction, Base64.NO_WRAP))).single()
        val body = SubmitStampRequest(Base64.encodeToString(signed, Base64.NO_WRAP))
        step("Sending USDC…")
        var pin = submitSigned { api.submitPinPayment(quote.pin.id, body) }
        repeat(30) {
            if (pin.status != "PENDING_PAYMENT") return@repeat
            delay(1_500)
            pin = submitSigned { api.submitPinPayment(quote.pin.id, body) }
        }
        if (pin.status == "PENDING_PAYMENT") PinPaymentOutcome.Pending("Your payment is still being confirmed. The pin goes live once it lands.")
        else PinPaymentOutcome.Activated(pin)
    }
}
