package com.larea.app.feature.deals

import com.larea.app.core.auth.SessionStore
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.MarketMeResponse
import com.larea.app.core.network.Offer
import com.larea.app.core.network.OfferStatus
import com.larea.app.core.network.Order
import com.larea.app.core.network.OrderStatus
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.apiCode
import com.larea.app.core.network.userMessage
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.core.realtime.ServerEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

data class DealsState(
    val me: MarketMeResponse = MarketMeResponse(),
    val myId: String? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val notice: String? = null,
    val busy: Boolean = false,
) {
    val isEmpty: Boolean get() = me.listings.isEmpty() && me.offersMade.isEmpty() && me.offersReceived.isEmpty() && me.orders.isEmpty()
    val pendingReceived: List<Offer> get() = me.offersReceived.filter { it.status == OfferStatus.PENDING }
    val acceptedReceived: List<Offer> get() = me.offersReceived.filter { it.status == OfferStatus.ACCEPTED && it.orderId == null }
    val ordersNeedingMe: List<Order> get() = me.orders.filter { OrderState.primary(it.status, OrderState.role(it, myId)) != null }
    val ordersInProgress: List<Order>
        get() = me.orders.filter {
            it.status in setOf(OrderStatus.AWAITING_PAYMENT, OrderStatus.PAID, OrderStatus.DISPUTED) && OrderState.primary(it.status, OrderState.role(it, myId)) == null
        }
    val ordersDone: List<Order> get() = me.orders.filter { it.status in setOf(OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.REFUNDED) }

    /** Offers waiting for the user's answer plus deals with a step they must take (the tab badge). */
    val attentionCount: Int get() = pendingReceived.size + ordersNeedingMe.size
}

/**
 * Everything the user is involved in on the market (iOS `DealsViewModel`). App-wide so the tab badge
 * stays current; refreshes 400 ms after any `market_update` event.
 */
@Singleton
class DealsStore @Inject constructor(
    private val api: LareaApi,
    private val realtime: RealtimeClient,
    private val store: SessionStore,
) {
    private val _state = MutableStateFlow(DealsState())
    val state: StateFlow<DealsState> = _state
    private var scope: CoroutineScope? = null
    private var pendingRefresh: Job? = null

    fun start() {
        if (scope != null) return
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate).also { this.scope = it }
        scope.launch {
            _state.update { it.copy(myId = store.current()?.user?.id) }
            refresh()
        }
        scope.launch {
            realtime.events.collect { event ->
                if (event is ServerEvent.MarketUpdate) {
                    pendingRefresh?.cancel()
                    pendingRefresh = launch { delay(400); refresh() }
                }
            }
        }
    }

    fun stop() {
        scope?.cancel()
        scope = null
        _state.value = DealsState()
    }

    suspend fun refresh() {
        apiCall { api.marketMe() }
            .onSuccess { me -> _state.update { it.copy(me = me, error = null, loading = false) } }
            .onFailure { e -> _state.update { it.copy(error = if (e.apiCode == "MARKET_DISABLED") null else e.userMessage(), loading = false) } }
    }

    fun refreshNow() {
        scope?.launch { refresh() }
    }

    private fun run(work: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        scope?.launch {
            apiCall { work() }.onSuccess { refresh() }.onFailure { e -> _state.update { it.copy(notice = e.userMessage()) } }
            _state.update { it.copy(busy = false) }
        }
    }

    fun accept(offer: Offer) = run { api.acceptOffer(offer.id) }
    fun decline(offer: Offer) = run { api.declineOffer(offer.id) }
    fun withdraw(offer: Offer) = run { api.withdrawOffer(offer.id) }
    fun dismissNotice() = _state.update { it.copy(notice = null) }
}
