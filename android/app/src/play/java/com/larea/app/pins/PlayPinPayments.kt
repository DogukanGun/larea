package com.larea.app.pins

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ConsumeParams
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.consumePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.MessagePin
import com.larea.app.core.network.PinPurchaseRequest
import com.larea.app.core.network.PinQuote
import com.larea.app.core.network.PinTier
import com.larea.app.core.network.apiCall
import com.larea.app.feature.pins.PinPaymentOutcome
import com.larea.app.feature.pins.PinPayments
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

class PinPurchaseException(message: String) : Exception(message)

/**
 * Google Play Billing for message pins: one consumable per tier. The pin's id rides along as the
 * obfuscated profile id; the server checks the purchase with the Play Developer API, activates the pin
 * and consumes the purchase. Purchases the server never heard about are delivered by [recover].
 */
@Singleton
class PlayPinPayments @Inject constructor(
    @ApplicationContext context: Context,
    private val api: LareaApi,
) : PinPayments {
    private val updates = MutableSharedFlow<Pair<BillingResult, List<Purchase>?>>(extraBufferCapacity = 8)
    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener { result, purchases -> updates.tryEmit(result to purchases) }
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()
    private val details = mutableMapOf<String, ProductDetails>()
    private val connecting = Mutex()
    private val pinProducts = PinTier.entries.map { it.productId }.toSet()

    private suspend fun connect(): Boolean = connecting.withLock {
        if (client.isReady) return true
        val done = CompletableDeferred<Boolean>()
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                done.complete(result.responseCode == BillingClient.BillingResponseCode.OK)
            }

            override fun onBillingServiceDisconnected() {
                done.complete(false)
            }
        })
        done.await()
    }

    private suspend fun product(productId: String): ProductDetails? {
        details[productId]?.let { return it }
        if (!connect()) return null
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(pinProducts.map { QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.INAPP).build() })
            .build()
        val result = client.queryProductDetails(params)
        result.productDetailsList?.forEach { details[it.productId] = it }
        return details[productId]
    }

    override suspend fun priceLabel(quote: PinQuote): String? =
        runCatching { product(quote.productId)?.oneTimePurchaseOfferDetails?.formattedPrice }.getOrNull()

    override suspend fun pay(activity: Activity, quote: PinQuote, step: (String) -> Unit): Result<PinPaymentOutcome> = runCatching {
        if (!connect()) throw PinPurchaseException("Google Play isn't available on this device right now.")
        val product = product(quote.productId) ?: throw PinPurchaseException("This pin can't be bought right now. Please try again later.")
        val offer = product.oneTimePurchaseOfferDetailsList?.firstOrNull()
        val params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .apply { offer?.offerToken?.let { setOfferToken(it) } }
                        .build(),
                ),
            )
            .setObfuscatedProfileId(quote.pin.id)
            .build()

        step("Opening Google Play…")
        val launched = withContext(Dispatchers.Main) { client.launchBillingFlow(activity, params) }
        when (launched.responseCode) {
            BillingClient.BillingResponseCode.OK -> Unit
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // An earlier purchase of this tier never reached us; deliver it, then the user can buy again.
                recover()
                throw PinPurchaseException("We finished an earlier purchase first. Please try again.")
            }
            else -> throw PinPurchaseException(launched.debugMessage.ifBlank { "Google Play couldn't start the purchase." })
        }
        val (result, purchases) = updates.first()
        when (result.responseCode) {
            BillingClient.BillingResponseCode.USER_CANCELED -> return@runCatching PinPaymentOutcome.Cancelled
            BillingClient.BillingResponseCode.OK -> Unit
            else -> throw PinPurchaseException(result.debugMessage.ifBlank { "The purchase didn't go through." })
        }
        val purchase = purchases?.firstOrNull { quote.productId in it.products }
            ?: throw PinPurchaseException("The purchase didn't go through.")
        if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
            return@runCatching PinPaymentOutcome.Pending("Your payment is pending. The pin goes live as soon as it clears.")
        }
        step("Putting your pin on the map…")
        PinPaymentOutcome.Activated(deliver(purchase))
    }

    /** Hands a completed purchase to the server; it verifies with Google and consumes it. */
    private suspend fun deliver(purchase: Purchase): MessagePin {
        val pinId = purchase.accountIdentifiers?.obfuscatedProfileId ?: throw PinPurchaseException("This purchase isn't linked to a pin.")
        val productId = purchase.products.first()
        return apiCall { api.purchasePin(pinId, PinPurchaseRequest(platform = "google", productId = productId, purchaseToken = purchase.purchaseToken)) }
            .onFailure { error ->
                // Settled for good on the server: consume locally so the tier can be bought again.
                if ((error as? ApiException)?.code in setOf("PURCHASE_REVOKED", "PURCHASE_USED", "PIN_ALREADY_PAID", "NOT_FOUND")) {
                    runCatching { client.consumePurchase(ConsumeParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()) }
                }
            }
            .getOrThrow()
    }

    override suspend fun recover(): List<MessagePin> {
        if (!connect()) return emptyList()
        val owned = client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build())
        return owned.purchasesList
            .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED && it.products.any { id -> id in pinProducts } }
            .mapNotNull { runCatching { deliver(it) }.getOrNull() }
    }
}
