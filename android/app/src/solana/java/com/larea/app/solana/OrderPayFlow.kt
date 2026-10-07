package com.larea.app.solana

import android.util.Base64
import com.larea.app.core.network.OrderStatus
import com.larea.app.core.network.apiCall
import kotlinx.coroutines.delay
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pays a USDC deal: Larea builds a transfer of the full amount from the buyer's wallet into its
 * escrow, the wallet signs, Larea sends it and marks the deal paid once it lands. The seller is paid
 * out of escrow when they confirm the handover code, exactly like a card deal.
 */
@Singleton
class OrderPayFlow @Inject constructor(
    private val api: SolanaApi,
    private val adapter: WalletAdapter,
) {
    suspend fun pay(orderId: String, step: (String) -> Unit): Result<Unit> = runCatching {
        step("Preparing the payment…")
        val payment = apiCall { api.payOrder(orderId) }.getOrThrow()
        adapter.useCluster(payment.cluster)
        step("Approve the payment in your wallet…")
        val signed = adapter.signTransactions(listOf(Base64.decode(payment.transaction, Base64.NO_WRAP))).single()
        val body = SubmitStampRequest(Base64.encodeToString(signed, Base64.NO_WRAP))
        step("Sending USDC to escrow…")
        var order = submitSigned { api.submitOrderPayment(orderId, body) }
        repeat(30) {
            if (order.status != OrderStatus.AWAITING_PAYMENT) return@repeat
            delay(1_500)
            order = submitSigned { api.submitOrderPayment(orderId, body) }
        }
        if (order.status == OrderStatus.AWAITING_PAYMENT) {
            throw WalletException("Your payment is still being confirmed. It will show here once it lands.")
        }
    }
}
