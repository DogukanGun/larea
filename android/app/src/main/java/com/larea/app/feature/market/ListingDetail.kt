package com.larea.app.feature.market

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.format.Dates
import com.larea.app.core.format.Money
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.CreateOfferRequest
import com.larea.app.core.network.CreateReportRequest
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Listing
import com.larea.app.core.network.ListingKind
import com.larea.app.core.network.ListingStatus
import com.larea.app.core.network.MarketConfig
import com.larea.app.core.network.Offer
import com.larea.app.core.network.OfferStatus
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.apiCode
import com.larea.app.core.network.userMessage
import com.larea.app.feature.chat.BlockDialog
import com.larea.app.feature.chat.MenuAction
import com.larea.app.feature.payouts.PayoutsContent
import com.larea.app.ui.components.Avatar
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.ImageViewer
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.ListingCard
import com.larea.app.ui.components.ListingCardLayout
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PriceTag
import com.larea.app.ui.components.PriceTagStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RemoteImage
import com.larea.app.ui.components.ReportReasons
import com.larea.app.ui.components.ReportSheet
import com.larea.app.ui.components.SecondaryButton
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ListingDetailState(
    val listing: Listing? = null,
    val config: MarketConfig = MarketConfig(),
    val loading: Boolean = true,
    val busy: Boolean = false,
    val tooFar: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    /** The server refused because the payee has no payout account yet. */
    val needsPayouts: Boolean = false,
    /** A deal was just opened by accepting an offer. */
    val openedOrderId: String? = null,
    val blocked: Boolean = false,
)

@HiltViewModel
class ListingDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val api: LareaApi,
    private val location: LocationSource,
) : ViewModel() {
    private val listingId: String = checkNotNull(savedState["id"])
    private val _state = MutableStateFlow(ListingDetailState())
    val state: StateFlow<ListingDetailState> = _state

    init {
        viewModelScope.launch { load() }
    }

    suspend fun load() {
        val fix = location.latest.value
        val query = if (fix != null) mapOf("lat" to fix.lat.toString(), "lng" to fix.lng.toString(), "accuracy" to fix.accuracyM.toString()) else emptyMap()
        apiCall { api.listing(listingId, query) }
            .onSuccess { listing ->
                _state.update { it.copy(listing = listing, tooFar = false, error = null) }
                if (listing.mine) apiCall { api.marketConfig() }.onSuccess { config -> _state.update { it.copy(config = config) } }
            }
            .onFailure { e -> _state.update { if (e.apiCode == "TOO_FAR") it.copy(tooFar = true) else it.copy(error = e.userMessage()) } }
        _state.update { it.copy(loading = false) }
    }

    fun reload() {
        viewModelScope.launch { load() }
    }

    private fun perform(success: String? = null, work: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            apiCall { work() }
                .onSuccess {
                    if (success != null) _state.update { it.copy(notice = success) }
                    load()
                }
                .onFailure { e ->
                    _state.update { if (e.apiCode == "PAYOUTS_NOT_READY") it.copy(needsPayouts = true) else it.copy(notice = e.userMessage()) }
                }
            _state.update { it.copy(busy = false) }
        }
    }

    fun makeOffer(amountCents: Int, note: String?) {
        val fix = location.latest.value ?: run {
            _state.update { it.copy(notice = "We need your location to make an offer.") }
            return
        }
        perform("Offer sent. You'll hear back here.") {
            api.makeOffer(listingId, CreateOfferRequest(amountCents, note?.takeIf { it.isNotEmpty() }, fix.lat, fix.lng, fix.accuracyM, fix.mocked))
        }
    }

    fun withdraw(offer: Offer) = perform { api.withdrawOffer(offer.id) }
    fun decline(offer: Offer) = perform { api.declineOffer(offer.id) }
    fun markSold() = perform { api.markSold(listingId) }
    fun cancel() = perform { api.cancelListing(listingId) }

    fun accept(offer: Offer) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            apiCall { api.acceptOffer(offer.id) }
                .onSuccess { response ->
                    val orderId = response.order?.id
                    _state.update {
                        it.copy(openedOrderId = orderId, notice = if (orderId == null) "Offer accepted. Arrange the handover with ${offer.offerer.displayName}." else it.notice)
                    }
                    load()
                }
                .onFailure { e -> _state.update { if (e.apiCode == "PAYOUTS_NOT_READY") it.copy(needsPayouts = true) else it.copy(notice = e.userMessage()) } }
            _state.update { it.copy(busy = false) }
        }
    }

    fun report(reason: String) {
        viewModelScope.launch {
            val result = apiCall { api.reportListing(listingId, CreateReportRequest(reason)) }
            _state.update { it.copy(notice = result.exceptionOrNull()?.userMessage() ?: "Thanks, your report was sent.") }
        }
    }

    fun blockOwner() {
        val owner = _state.value.listing?.owner ?: return
        viewModelScope.launch {
            apiCall { api.block(owner.id) }
                .onSuccess { _state.update { it.copy(blocked = true) } }
                .onFailure { e -> _state.update { it.copy(notice = e.userMessage()) } }
        }
    }

    fun edited(listing: Listing) {
        _state.update { it.copy(listing = listing, notice = listing.notice ?: it.notice) }
        reload()
    }

    fun dismissNotice() = _state.update { it.copy(notice = null) }
    fun dismissPayouts() = _state.update { it.copy(needsPayouts = false) }
    fun consumeOrder() = _state.update { it.copy(openedOrderId = null) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingDetailScreen(onBack: () -> Unit, onOpenOrder: (String) -> Unit, bottomInset: androidx.compose.ui.unit.Dp, model: ListingDetailViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var showOffer by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }
    var showEdit by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<String?>(null) }
    var viewing by remember { mutableStateOf<ImageAttachment?>(null) }
    val listing = state.listing

    LaunchedEffect(state.openedOrderId) {
        state.openedOrderId?.let { id -> model.consumeOrder(); onOpenOrder(id) }
    }
    LaunchedEffect(state.blocked) { if (state.blocked) onBack() }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar(
            title = "",
            onBack = onBack,
            actions = {
                if (listing != null) {
                    Box {
                        IconButton(onClick = { menu = true }, modifier = Modifier.testTag("market.listing.menu")) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "More", tint = c.brandPrimary)
                        }
                        val items = if (listing.mine) buildList {
                            if (listing.status == ListingStatus.ACTIVE) add(MenuAction("Edit listing", Icons.Filled.Edit) { showEdit = true })
                            if (listing.status == ListingStatus.ACTIVE || listing.status == ListingStatus.RESERVED) add(MenuAction("Mark as sold", Icons.Filled.Verified) { confirm = "sold" })
                            if (listing.status == ListingStatus.ACTIVE) add(MenuAction("Cancel listing", Icons.Filled.Cancel, destructive = true) { confirm = "cancel" })
                        } else listOf(
                            MenuAction("Report listing", Icons.Filled.Flag) { showReport = true },
                            MenuAction("Block ${listing.owner.displayName}", Icons.Filled.PanTool, destructive = true) { confirm = "block" },
                        )
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.exposeTestTags()) {
                            items.forEach { item ->
                                DropdownMenuItem(
                                    text = { Text(item.title, color = if (item.destructive) c.danger else c.text) },
                                    leadingIcon = { Icon(item.icon, null, tint = if (item.destructive) c.danger else c.secondaryText) },
                                    onClick = { menu = false; item.onClick() },
                                )
                            }
                        }
                    }
                }
            },
        )
        Box(Modifier.weight(1f)) {
            when {
                listing != null -> PullToRefreshBox(
                    isRefreshing = refreshing,
                    onRefresh = { scope.launch { refreshing = true; model.load(); refreshing = false } },
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.l), modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Spacing.screen)) {
                        Details(listing, state.busy, onView = { viewing = it }, model = model, onOpenOrder = onOpenOrder)
                    }
                }
                state.tooFar -> EmptyState(Icons.Filled.LocationOff, "Too far away", description = "Listings are only visible within 2 km. Come closer to see the details.", modifier = Modifier.padding(top = 80.dp))
                state.error != null -> EmptyState(Icons.Filled.WifiOff, "Can't load listing", description = state.error, modifier = Modifier.padding(top = 80.dp)) {
                    Button(onClick = model::reload, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Retry") }
                }
                else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.brandPrimary) }
            }
        }
        if (listing != null) ActionBar(listing, state.busy, bottomInset, onOffer = { showOffer = true })
    }

    viewing?.let { ImageViewer(it, onDismiss = { viewing = null }) }
    if (showOffer && listing != null) {
        OfferSheet(listing, onDismiss = { showOffer = false }) { amount, note ->
            showOffer = false
            model.makeOffer(amount, note)
        }
    }
    if (showEdit && listing != null) {
        ListingEditor(config = state.config, editing = listing, onDismiss = { showEdit = false }) { updated ->
            showEdit = false
            model.edited(updated)
        }
    }
    if (showReport) {
        ReportSheet("Report listing", ReportReasons.listing, onDismiss = { showReport = false }) { reason ->
            showReport = false
            model.report(reason)
        }
    }
    when (confirm) {
        "block" -> if (listing != null) BlockDialog(listing.owner.displayName, onConfirm = { confirm = null; model.blockOwner() }, onDismiss = { confirm = null })
        "sold" -> ConfirmDialog("Mark as sold?", "Open offers will be declined.", "Mark as sold", destructive = false, onConfirm = { confirm = null; model.markSold() }, onDismiss = { confirm = null })
        "cancel" -> ConfirmDialog("Cancel this listing?", "It disappears from the map and open offers are declined.", "Cancel listing", dismissLabel = "Keep it", onConfirm = { confirm = null; model.cancel() }, onDismiss = { confirm = null })
    }
    if (state.needsPayouts) {
        ModalBottomSheet(onDismissRequest = model::dismissPayouts, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.background) {
            Column(Modifier.exposeTestTags().fillMaxWidth()) {
                TextButton(onClick = model::dismissPayouts, modifier = Modifier.padding(horizontal = Spacing.s)) { Text("Later") }
                PayoutsContent(onReady = model::dismissPayouts)
            }
        }
    }
    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = model::dismissNotice,
            title = { Text("Market", style = LareaType.headline) },
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = model::dismissNotice) { Text("OK") } },
        )
    }
}

@Composable
fun ConfirmDialog(title: String, message: String, confirmLabel: String, destructive: Boolean = true, dismissLabel: String = "Cancel", onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, style = LareaType.headline) },
        text = { Text(message) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirmLabel, color = if (destructive) Larea.colors.danger else Larea.colors.brandPrimary) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(dismissLabel) } },
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Details(listing: Listing, busy: Boolean, onView: (ImageAttachment) -> Unit, model: ListingDetailViewModel, onOpenOrder: (String) -> Unit) {
    val c = Larea.colors
    if (listing.images.isNotEmpty()) {
        val pager = rememberPagerState { listing.images.size }
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(Radius.card)).testTag("market.listing.images")) {
            HorizontalPager(pager, modifier = Modifier.fillMaxSize()) { page ->
                val image = listing.images[page]
                RemoteImage(image.thumbnailUrl, Modifier.fillMaxSize().clickable { onView(image) }, contentDescription = "Photo ${page + 1} of ${listing.images.size}")
            }
            if (listing.images.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.align(Alignment.BottomCenter).padding(Spacing.s)) {
                    repeat(listing.images.size) { index ->
                        Box(Modifier.size(7.dp).background(if (index == pager.currentPage) androidx.compose.ui.graphics.Color.White else androidx.compose.ui.graphics.Color.White.copy(alpha = 0.5f), CircleShape))
                    }
                }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
        PriceTag(listing.priceCents, currency = listing.currency, large = true, style = PriceTagStyle.Plain)
        Pill(listing.kind.label, style = if (listing.kind == ListingKind.REQUEST) PillStyle.Sunny else PillStyle.Tint)
        if (listing.status != ListingStatus.ACTIVE) Pill(listing.status.label, style = PillStyle.Neutral)
    }
    Text(listing.title, style = LareaType.title2, color = c.text)
    Text(
        listOfNotNull(listing.category.label, listing.distanceText, Dates.relative(listing.createdAt).takeIf { it.isNotEmpty() }).joinToString(" · "),
        style = LareaType.subheadline,
        color = c.secondaryText,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), verticalAlignment = Alignment.CenterVertically) {
        Avatar(listing.owner.displayName, listing.owner.id, size = 36.dp)
        Text(listing.owner.displayName, style = LareaType.headline, color = c.text)
        if (listing.mine) Pill("You", style = PillStyle.Tint)
    }
    if (listing.description.isNotEmpty()) Text(listing.description, style = LareaType.body, color = c.text)
    NoteCard(Icons.Filled.Place, "The pin shows an approximate spot. Agree on a public meeting place in the offer.")
    val offers = listing.offers
    if (listing.mine && offers != null) {
        Text(if (offers.isEmpty()) "No offers yet" else "Offers (${offers.size})", style = LareaType.title3, color = c.text, modifier = Modifier.padding(top = Spacing.s))
        offers.forEach { offer ->
            OfferRow(offer, OfferPerspective.Owner, busy, onAccept = { model.accept(offer) }, onDecline = { model.decline(offer) }, onWithdraw = null)
        }
    }
    val mine = listing.myOffer
    if (!listing.mine && mine != null) {
        OfferRow(mine, OfferPerspective.Offerer, busy, onAccept = null, onDecline = null, onWithdraw = if (mine.status == OfferStatus.PENDING) ({ model.withdraw(mine) }) else null)
        mine.orderId?.let { orderId -> SecondaryButton("Go to deal", onClick = { onOpenOrder(orderId) }, tag = "market.listing.deal") }
    }
}

@Composable
private fun ActionBar(listing: Listing, busy: Boolean, bottomInset: androidx.compose.ui.unit.Dp, onOffer: () -> Unit) {
    val c = Larea.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        HorizontalDivider(color = c.separator, thickness = 0.5.dp)
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth().background(c.card).padding(horizontal = Spacing.screen, vertical = Spacing.m).padding(bottom = bottomInset),
        ) {
            val myOffer = listing.myOffer
            when {
                listing.mine && listing.status == ListingStatus.ACTIVE -> Caption("Your listing is live. Offers show up above and in Deals.")
                listing.mine && listing.status == ListingStatus.RESERVED -> Caption("Reserved: finish the handover, then mark it as sold.")
                listing.mine -> Caption("This listing is ${listing.status.label.lowercase()}.")
                listing.status == ListingStatus.ACTIVE && myOffer?.status == OfferStatus.PENDING ->
                    NoteCard(Icons.Filled.Schedule, "Offer sent: ${Money.format(myOffer.amountCents, listing.currency)}. Waiting for ${listing.owner.displayName}.")
                listing.status == ListingStatus.ACTIVE && myOffer?.status == OfferStatus.ACCEPTED ->
                    NoteCard(Icons.Filled.CheckCircle, "Accepted! Arrange the handover with ${listing.owner.displayName}.")
                listing.status == ListingStatus.ACTIVE ->
                    PrimaryButton(if (listing.kind == ListingKind.REQUEST) "Offer to help" else "Make an offer", onClick = onOffer, loading = busy, tag = "market.offer")
                listing.status == ListingStatus.RESERVED && myOffer?.status == OfferStatus.ACCEPTED ->
                    NoteCard(Icons.Filled.CheckCircle, "Reserved for you. Arrange the handover with ${listing.owner.displayName}.")
                else -> Caption("This listing is ${listing.status.label.lowercase()}.")
            }
        }
    }
}

@Composable
private fun Caption(text: String) = Text(text, style = LareaType.caption, color = Larea.colors.secondaryText, textAlign = TextAlign.Center)

enum class OfferPerspective { Owner, Offerer }

/** An offer line with the actions for the side looking at it. */
@Composable
fun OfferRow(offer: Offer, perspective: OfferPerspective, busy: Boolean, onAccept: (() -> Unit)?, onDecline: (() -> Unit)?, onWithdraw: (() -> Unit)?, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = modifier.fillMaxWidth().background(c.card, RoundedCornerShape(Radius.card)).padding(Spacing.m).testTag("market.offer.${offer.id}"),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), verticalAlignment = Alignment.CenterVertically) {
            Avatar(offer.offerer.displayName, offer.offerer.id, size = 32.dp)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                Text(if (perspective == OfferPerspective.Owner) offer.offerer.displayName else "Your offer", style = LareaType.headline, color = c.text)
                if (!offer.note.isNullOrEmpty()) Text(offer.note, style = LareaType.subheadline, color = c.secondaryText)
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(Money.format(offer.amountCents), style = LareaType.title3, color = c.text)
                Pill(
                    offer.status.label,
                    style = when (offer.status) {
                        OfferStatus.ACCEPTED -> PillStyle.Success
                        OfferStatus.PENDING -> PillStyle.Sunny
                        else -> PillStyle.Neutral
                    },
                )
            }
        }
        if (offer.status == OfferStatus.PENDING) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                if (onAccept != null) PrimaryButton("Accept", onClick = onAccept, loading = busy, tag = "market.offer.accept", modifier = Modifier.weight(1f))
                if (onDecline != null) SecondaryButton("Decline", onClick = onDecline, tag = "market.offer.decline", modifier = Modifier.weight(1f))
                if (onWithdraw != null) SecondaryButton("Withdraw offer", onClick = onWithdraw, tag = "market.offer.withdraw", modifier = Modifier.weight(1f))
            }
        }
    }
}

/** Propose a price (or an amount for help), with an optional note to the other side. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfferSheet(listing: Listing, onDismiss: () -> Unit, onSubmit: (Int, String?) -> Unit) {
    val c = Larea.colors
    var amountText by remember { mutableStateOf(Money.editText(listing.priceCents)) }
    var note by remember { mutableStateOf("") }
    var attempted by remember { mutableStateOf(false) }
    val request = listing.kind == ListingKind.REQUEST
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.grouped) {
        Column(
            verticalArrangement = Arrangement.spacedBy(Spacing.l),
            modifier = Modifier.exposeTestTags().fillMaxWidth().imePadding().navigationBarsPadding().padding(horizontal = Spacing.screen).padding(bottom = Spacing.xl),
        ) {
            Text(if (request) "Offer to help" else "Make an offer", style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            ListingCard(listing, Modifier.background(c.card, RoundedCornerShape(Radius.card)).padding(Spacing.m), ListingCardLayout.Compact)
            LareaField(
                if (request) "Your price for the job (${listing.currency.uppercase()})" else "Your offer (${listing.currency.uppercase()})",
                amountText, { amountText = it }, keyboardType = KeyboardType.Decimal, tag = "market.offer.amount",
            )
            if (attempted && Money.parse(amountText) == null) InlineError("Enter an amount.")
            LareaField(
                "Note (optional)", note, { note = it },
                placeholder = if (request) "When can you help?" else "When could you pick it up?",
                singleLine = false, minLines = 2, maxLines = 5, capitalization = KeyboardCapitalization.Sentences, tag = "market.offer.note",
            )
            PrimaryButton("Send offer", onClick = {
                attempted = true
                val amount = Money.parse(amountText) ?: return@PrimaryButton
                onSubmit(amount, note.trim())
            }, tag = "market.offer.submit")
            Text(
                if (request) "The neighbour can accept or decline. Payment happens in the app once they accept."
                else "The seller can accept or decline. You only pay after they accept.",
                style = LareaType.footnote,
                color = c.secondaryText,
            )
        }
    }
}

