package com.larea.app.ui.navigation

import com.larea.app.feature.chat.ChatSession
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

data class ActiveChat(val session: ChatSession, val venueId: String, val venueName: String)

data class CheckoutResult(val orderId: String, val success: Boolean, val nonce: String = UUID.randomUUID().toString())

/** Something the main scaffold should do with its navigation controller. */
sealed interface NavRequest {
    data object ShowChat : NavRequest
    data object CloseChat : NavRequest
    data class Open(val tab: AppTab, val route: Any, val resetStack: Boolean = true) : NavRequest
    data class SwitchTab(val tab: AppTab) : NavRequest
}

/**
 * Tab selection, the live chat session and deep-link routing (the iOS `AppRouter`). The chat survives
 * tab switches so the heartbeat keeps running; links that arrive before the main screen is up wait.
 */
@Singleton
class AppRouter @Inject constructor() {
    private val _tab = MutableStateFlow(AppTab.Nearby)
    val tab: StateFlow<AppTab> = _tab

    private val _activeChat = MutableStateFlow<ActiveChat?>(null)
    val activeChat: StateFlow<ActiveChat?> = _activeChat

    private val _checkoutResult = MutableStateFlow<CheckoutResult?>(null)
    val checkoutResult: StateFlow<CheckoutResult?> = _checkoutResult

    private val _stripeReturns = MutableStateFlow(0)
    val stripeReturns: StateFlow<Int> = _stripeReturns

    private val _requests = MutableSharedFlow<NavRequest>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val requests: SharedFlow<NavRequest> = _requests

    private var pendingLink: DeepLink? = null
    private var mainVisible = false

    fun selectTab(tab: AppTab) {
        _tab.value = tab
    }

    fun open(tab: AppTab, route: Any) {
        _tab.value = tab
        _requests.tryEmit(NavRequest.Open(tab, route, resetStack = false))
    }

    fun openChat(session: ChatSession, venueId: String, venueName: String) {
        _activeChat.value?.session?.stop()
        _activeChat.value = ActiveChat(session, venueId, venueName)
        session.start()
        _tab.value = AppTab.Nearby
        _requests.tryEmit(NavRequest.ShowChat)
    }

    fun openPin(pinId: String) = open(AppTab.Nearby, NearbyPin(pinId))

    /** Brings a live chat back on screen after the user switched tabs. */
    fun showActiveChat() {
        if (_activeChat.value == null) return
        _tab.value = AppTab.Nearby
        _requests.tryEmit(NavRequest.ShowChat)
    }

    fun endChat() {
        _activeChat.value?.session?.stop()
        _activeChat.value = null
        _requests.tryEmit(NavRequest.CloseChat)
    }

    /** Applies a link now, or keeps it until the main flow is on screen. */
    fun handle(raw: String?) {
        val link = DeepLink.parse(raw) ?: return
        if (mainVisible) apply(link) else pendingLink = link
    }

    fun mainShown() {
        mainVisible = true
        pendingLink?.let { pendingLink = null; apply(it) }
    }

    /** Sign-out or suspension: drop everything. */
    fun reset() {
        mainVisible = false
        _activeChat.value?.session?.stop()
        _activeChat.value = null
        _tab.value = AppTab.Nearby
        _checkoutResult.value = null
    }

    fun consumeCheckoutResult(nonce: String) {
        if (_checkoutResult.value?.nonce == nonce) _checkoutResult.value = null
    }

    private fun apply(link: DeepLink) {
        when (link) {
            is DeepLink.OrderCheckout -> {
                _tab.value = AppTab.Deals
                _checkoutResult.value = CheckoutResult(link.orderId, link.success)
                _requests.tryEmit(NavRequest.Open(AppTab.Deals, DealsOrder(link.orderId)))
            }
            DeepLink.StripeReturn -> {
                _tab.value = AppTab.Profile
                _stripeReturns.value += 1
                _requests.tryEmit(NavRequest.Open(AppTab.Profile, ProfilePayouts))
            }
        }
    }
}
