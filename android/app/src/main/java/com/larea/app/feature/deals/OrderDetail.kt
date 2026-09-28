package com.larea.app.feature.deals

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionStore
import com.larea.app.core.browser.InAppBrowser
import com.larea.app.core.format.Dates
import com.larea.app.core.format.Money
import com.larea.app.core.network.ApproveOrderRequest
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Order
import com.larea.app.core.network.OrderStatus
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.feature.market.ConfirmDialog
import com.larea.app.ui.components.Avatar
import com.larea.app.ui.components.Banner
import com.larea.app.ui.components.BannerKind
import com.larea.app.ui.components.CodeEntryField
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.OnResume
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RemoteImage
import com.larea.app.ui.components.SecondaryButton
import com.larea.app.ui.components.StatusStepper
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.navigation.AppRouter
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Rounded
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OrderDetailState(
    val order: Order? = null,
    val myId: String? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val banner: Pair<BannerKind, String>? = null,
)

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: LareaApi,
    private val store: SessionStore,
    val router: AppRouter,
) : ViewModel() {
    val orderId: String = checkNotNull(savedState["id"])
    private val _state = MutableStateFlow(OrderDetailState())
    val state: StateFlow<OrderDetailState> = _state
    private var poll: Job? = null
    /** A Checkout page is open in a Custom Tab; reload when the app comes back. */
    var browserOpen = false

    init {
        viewModelScope.launch {
            _state.update { it.copy(myId = store.current()?.user?.id) }
            load()
        }
    }

    suspend fun load() {
        apiCall { api.order(orderId) }
            .onSuccess { order -> _state.update { it.copy(order = order, error = null) } }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        _state.update { it.copy(loading = false) }
    }

    fun reload() {
        viewModelScope.launch { load() }
    }

    private fun run(work: suspend () -> Unit, after: suspend () -> Unit = {}) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            apiCall { work() }
                .onSuccess { after(); load() }
                .onFailure { e -> _state.update { it.copy(notice = e.userMessage()) } }
            _state.update { it.copy(busy = false) }
        }
    }

    /** Opens (or resumes) the Stripe Checkout page. */
    fun pay(open: (String) -> Unit) {
        _state.value.order?.checkout?.url?.let { url ->
            browserOpen = true
            open(url)
            return
        }
        run({
            val session = api.checkout(orderId)
            browserOpen = true
            open(session.url)
        })
    }

    fun approve(code: String, onDone: () -> Unit) = run(
        { api.approveOrder(orderId, ApproveOrderRequest(code)) },
        after = {
            onDone()
            _state.update { it.copy(banner = BannerKind.Info to "Handover confirmed. The payout is on its way.") }
        },
    )

    fun cancel() = run({ api.cancelOrder(orderId) })

    /** The webhook can land after the browser comes back; ask a few times. */
    fun checkoutReturned(success: Boolean) {
        browserOpen = false
        if (!success) {
            _state.update { it.copy(banner = BannerKind.Warning to "Payment cancelled. You can pay later from here.") }
            return
        }
        _state.update { it.copy(banner = BannerKind.Info to "Payment received. Confirming…") }
        poll?.cancel()
        poll = viewModelScope.launch {
            for (attempt in 0 until 15) {
                load()
                if (_state.value.order?.status != OrderStatus.AWAITING_PAYMENT) break
                delay(2_000)
            }
            when (_state.value.order?.status) {
                OrderStatus.PAID -> _state.update { it.copy(banner = BannerKind.Info to "Paid. Show your handover code when you meet.") }
                OrderStatus.AWAITING_PAYMENT -> _state.update { it.copy(banner = BannerKind.Warning to "We haven't seen the payment yet. Pull to refresh in a moment.") }
                else -> Unit
            }
        }
    }

    fun dismissNotice() = _state.update { it.copy(notice = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(onBack: () -> Unit, onOpenListing: (String) -> Unit, bottomInset: Dp, model: OrderDetailViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val checkout by model.router.checkoutResult.collectAsStateWithLifecycle()
    val c = Larea.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var showCode by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var confirmCancel by remember { mutableStateOf(false) }

    LaunchedEffect(checkout) {
        val result = checkout ?: return@LaunchedEffect
        if (result.orderId != model.orderId) return@LaunchedEffect
        model.router.consumeCheckoutResult(result.nonce)
        model.checkoutReturned(result.success)
    }
    // Closing the Custom Tab without the redirect: reload so a finished payment still shows up.
    OnResume { if (model.browserOpen) { model.browserOpen = false; model.reload() } }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar("Deal", onBack = onBack)
        state.banner?.let { (kind, text) -> Banner(kind, text) }
        val order = state.order
        Box(Modifier.weight(1f)) {
            when {
                order != null -> PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } }) {
                    OrderBody(order, OrderState.role(order, state.myId), onOpenListing)
                }
                state.error != null -> EmptyState(Icons.Filled.WifiOff, "Can't load this deal", description = state.error, modifier = Modifier.padding(top = 80.dp)) {
                    Button(onClick = model::reload, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Retry") }
                }
                else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.brandPrimary) }
            }
        }
        if (order != null) {
            val role = OrderState.role(order, state.myId)
            val primary = OrderState.primary(order.status, role)
            val secondary = OrderState.secondary(order.status, role)
            if (primary != null || secondary.isNotEmpty()) {
                HorizontalDivider(color = c.separator, thickness = 0.5.dp)
                Column(
                    verticalArrangement = Arrangement.spacedBy(Spacing.s),
                    modifier = Modifier.fillMaxWidth().background(c.card).padding(horizontal = Spacing.screen, vertical = Spacing.m).padding(bottom = bottomInset),
                ) {
                    if (primary != null) {
                        PrimaryButton(
                            primary.title,
                            onClick = {
                                when (primary) {
                                    OrderAction.Pay -> model.pay { url -> InAppBrowser.open(context, url, c.brandPrimary) }
                                    OrderAction.ApproveHandover -> showCode = true
                                    else -> Unit
                                }
                            },
                            loading = state.busy,
                            tag = if (primary == OrderAction.Pay) "market.order.pay" else "market.order.approve",
                        )
                    }
                    secondary.forEach { action -> SecondaryButton(action.title, onClick = { confirmCancel = true }, tag = "market.order.cancel") }
                }
            }
            if (showCode) {
                ModalBottomSheet(onDismissRequest = { showCode = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.background) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(Spacing.l),
                        modifier = Modifier.exposeTestTags().fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = Spacing.screen).padding(bottom = Spacing.xl),
                    ) {
                        Text("Confirm handover", style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                        Text(
                            "Ask ${order.counterpart.displayName} for the six-digit code on their phone. Entering it releases ${Money.format(order.payoutCents, order.currency)} to you.",
                            style = LareaType.subheadline, color = c.secondaryText, textAlign = TextAlign.Center,
                        )
                        CodeEntryField(code, { code = it }, tag = "market.order.codeField")
                        PrimaryButton(
                            "Confirm handover",
                            onClick = { model.approve(code) { showCode = false; code = "" } },
                            loading = state.busy,
                            enabled = code.length == 6,
                            tag = "market.order.approve.confirm",
                        )
                    }
                }
            }
            if (confirmCancel) {
                val refund = role == OrderRole.Payer && order.status == OrderStatus.PAID
                ConfirmDialog(
                    "Cancel this deal?",
                    when {
                        order.status != OrderStatus.PAID -> "The listing reopens for other offers."
                        role == OrderRole.Payer -> "Your payment goes back to your card and the listing reopens."
                        else -> "${order.counterpart.displayName} gets their money back and the listing reopens."
                    },
                    if (refund) "Cancel and refund me" else "Cancel deal",
                    dismissLabel = "Keep it",
                    onConfirm = { confirmCancel = false; model.cancel() },
                    onDismiss = { confirmCancel = false },
                )
            }
        }
    }
    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = model::dismissNotice,
            title = { Text("Deal", style = LareaType.headline) },
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = model::dismissNotice) { Text("OK") } },
        )
    }
}

@Composable
private fun OrderBody(order: Order, role: OrderRole, onOpenListing: (String) -> Unit) {
    val c = Larea.colors
    val failed = order.status in setOf(OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.DISPUTED)
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.l), modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.screen)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.m),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius.field)).clickable { onOpenListing(order.listingId) }.padding(vertical = 4.dp),
        ) {
            RemoteImage(order.listing.thumbnailUrl, Modifier.size(56.dp).clip(RoundedCornerShape(Radius.field)))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                Text(order.listing.title, style = LareaType.headline, color = c.text, maxLines = 2)
                Text(order.listing.kind.label, style = LareaType.subheadline, color = c.secondaryText)
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
        }
        StatusStepper(
            OrderState.steps,
            current = OrderState.stepIndex(order.status) ?: if (order.status == OrderStatus.REFUNDED) 1 else 0,
            failed = failed,
            modifier = Modifier.padding(vertical = Spacing.s),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
            Pill(order.status.label, style = if (failed) PillStyle.Neutral else if (order.status == OrderStatus.COMPLETED) PillStyle.Success else PillStyle.Sunny)
            if (failed) order.cancelReason?.let { Text(OrderState.reasonText(it), style = LareaType.caption, color = c.secondaryText) }
        }
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().background(c.card, RoundedCornerShape(Radius.card)).padding(Spacing.m)) {
            AmountLine(if (role == OrderRole.Payer) "You pay" else "Buyer pays", Money.format(order.amountCents, order.currency), strong = true)
            if (role == OrderRole.Payee) {
                AmountLine("Larea fee", "−${Money.format(order.feeCents, order.currency)}", muted = true)
                HorizontalDivider(color = c.separator, thickness = 0.5.dp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("You receive", style = LareaType.headline, color = c.text, modifier = Modifier.weight(1f))
                    Text(Money.format(order.payoutCents, order.currency), style = LareaType.title3, color = c.brandPrimary)
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), verticalAlignment = Alignment.CenterVertically) {
            Avatar(order.counterpart.displayName, order.counterpart.id, size = 36.dp)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(order.counterpart.displayName, style = LareaType.headline, color = c.text)
                Text(if (role == OrderRole.Payer) "Seller" else "Buyer", style = LareaType.caption, color = c.secondaryText)
            }
        }
        val handover = order.handoverCode
        if (role == OrderRole.Payer && order.status == OrderStatus.PAID && handover != null) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().background(c.brandTint, RoundedCornerShape(Radius.card)).padding(Spacing.l)) {
                Text("Your handover code", style = LareaType.headline, color = c.text)
                Text(
                    handover.chunked(3).joinToString(" "),
                    fontFamily = Rounded, fontWeight = FontWeight.Black, fontSize = 40.sp, color = c.brandPrimary,
                    modifier = Modifier.testTag("market.order.code"),
                )
                Text("Show it to ${order.counterpart.displayName} only when you have the item. Entering it pays them.", style = LareaType.caption, color = c.secondaryText)
            }
        }
        OrderState.waitingText(order.status, role, order.counterpart.displayName)?.let { text ->
            NoteCard(if (order.status == OrderStatus.DISPUTED) Icons.Filled.Warning else Icons.Filled.Schedule, text)
        }
        val events = listOf(
            "Offer accepted" to order.createdAt,
            "Paid" to order.paidAt,
            "Handover confirmed" to order.completedAt,
            "Cancelled" to order.cancelledAt,
            "Refunded" to order.refundedAt,
        ).filter { !it.second.isNullOrEmpty() }
        if (events.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().background(c.card, RoundedCornerShape(Radius.card)).padding(Spacing.m)) {
                events.forEach { (label, iso) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, style = LareaType.subheadline, color = c.text, modifier = Modifier.weight(1f))
                        Text(Dates.dateTime(iso), style = LareaType.caption, color = c.secondaryText)
                    }
                }
            }
        }
    }
}

@Composable
private fun AmountLine(label: String, value: String, strong: Boolean = false, muted: Boolean = false) {
    val c = Larea.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = LareaType.body, color = if (muted) c.secondaryText else c.text, modifier = Modifier.weight(1f))
        Text(value, style = if (strong) LareaType.headline else LareaType.body, color = if (muted) c.secondaryText else c.text)
    }
}
