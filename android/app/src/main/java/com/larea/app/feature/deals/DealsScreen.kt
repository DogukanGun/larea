package com.larea.app.feature.deals

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.core.format.Money
import com.larea.app.core.network.Offer
import com.larea.app.core.network.OfferStatus
import com.larea.app.core.network.Order
import com.larea.app.core.network.OrderStatus
import com.larea.app.feature.market.OfferPerspective
import com.larea.app.feature.market.OfferRow
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.ListingCard
import com.larea.app.ui.components.ListingCardLayout
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.RemoteImage
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/** Offers and listings the user is part of (iOS `DealsView`). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DealsScreen(store: DealsStore, marketEnabled: Boolean, onOpenOrder: (String) -> Unit, onOpenListing: (String) -> Unit, bottomInset: Dp) {
    val state by store.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar("Deals")
        if (!marketEnabled) {
            EmptyState(Icons.Filled.Sell, "No deals yet", description = "Offers you make or receive show up here.", modifier = Modifier.padding(top = 80.dp))
            return@Column
        }
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; store.refresh(); refreshing = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(contentPadding = PaddingValues(bottom = bottomInset + Spacing.l), modifier = Modifier.fillMaxSize().testTag("deals.root")) {
                when {
                    state.loading && state.isEmpty -> item {
                        GroupedCard(Modifier.padding(top = Spacing.l)) {
                            repeat(3) { index ->
                                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(Spacing.l)) {
                                    Box(Modifier.size(56.dp).background(c.fill, RoundedCornerShape(14.dp)))
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Box(Modifier.size(160.dp, 14.dp).background(c.fill, RoundedCornerShape(4.dp)))
                                        Box(Modifier.size(110.dp, 12.dp).background(c.fill, RoundedCornerShape(4.dp)))
                                    }
                                }
                                if (index < 2) RowDivider(inset = 84)
                            }
                        }
                    }
                    state.isEmpty -> item { EmptyState(Icons.Filled.Sell, "No deals yet", description = "Offers you make or receive show up here.", modifier = Modifier.padding(top = 80.dp)) }
                    else -> {
                        if (state.pendingReceived.isNotEmpty() || state.ordersNeedingMe.isNotEmpty()) {
                            item { SectionHeader("Needs your attention") }
                            if (state.ordersNeedingMe.isNotEmpty()) item { OrderCard(state.ordersNeedingMe, state.myId, onOpenOrder) }
                            state.pendingReceived.forEach { offer -> item(key = "pr-${offer.id}") { OfferItem(offer, OfferPerspective.Owner, state.busy, store, onOpenListing) } }
                        }
                        if (state.ordersInProgress.isNotEmpty()) {
                            item { SectionHeader("In progress") }
                            item { OrderCard(state.ordersInProgress, state.myId, onOpenOrder) }
                        }
                        if (state.acceptedReceived.isNotEmpty()) {
                            item { SectionHeader("Accepted on your listings") }
                            state.acceptedReceived.forEach { offer -> item(key = "ar-${offer.id}") { OfferItem(offer, OfferPerspective.Owner, state.busy, store, onOpenListing) } }
                        }
                        if (state.me.offersMade.isNotEmpty()) {
                            item { SectionHeader("My offers") }
                            state.me.offersMade.forEach { offer -> item(key = "om-${offer.id}") { OfferItem(offer, OfferPerspective.Offerer, state.busy, store, onOpenListing) } }
                        }
                        if (state.ordersDone.isNotEmpty()) {
                            item { SectionHeader("Done") }
                            item { OrderCard(state.ordersDone.take(20), state.myId, onOpenOrder) }
                        }
                        if (state.me.listings.isNotEmpty()) {
                            item { SectionHeader("My listings") }
                            item {
                                GroupedCard {
                                    state.me.listings.forEachIndexed { index, listing ->
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
                                            modifier = Modifier.fillMaxWidth().clickable { onOpenListing(listing.id) }.padding(horizontal = Spacing.l, vertical = 8.dp).testTag("deals.listing.${listing.id}"),
                                        ) {
                                            ListingCard(listing, Modifier.weight(1f), ListingCardLayout.Row)
                                            val count = listing.offerCount ?: 0
                                            if (count > 0) {
                                                Box(Modifier.size(24.dp).background(c.sunny, CircleShape), contentAlignment = Alignment.Center) {
                                                    Text("$count", style = LareaType.captionBold, color = c.onSunny)
                                                }
                                            }
                                        }
                                        if (index < state.me.listings.lastIndex) RowDivider(inset = 100)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = store::dismissNotice,
            title = { Text("Deals", style = LareaType.headline) },
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = store::dismissNotice) { Text("OK") } },
        )
    }
}

@Composable
private fun OrderCard(orders: List<Order>, myId: String?, onOpen: (String) -> Unit) {
    GroupedCard {
        orders.forEachIndexed { index, order ->
            OrderRow(order, myId) { onOpen(order.id) }
            if (index < orders.lastIndex) RowDivider(inset = 84)
        }
    }
}

@Composable
private fun OrderRow(order: Order, myId: String?, onClick: () -> Unit) {
    val c = Larea.colors
    val role = OrderState.role(order, myId)
    val primary = OrderState.primary(order.status, role)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Spacing.l, vertical = 10.dp).testTag("deals.order.${order.id}"),
    ) {
        RemoteImage(order.listing.thumbnailUrl, Modifier.size(56.dp).clip(RoundedCornerShape(Radius.field)))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text(order.listing.title, style = LareaType.headline, color = c.text, maxLines = 1)
            Text("${if (role == OrderRole.Payer) "Buying from" else "Selling to"} ${order.counterpart.displayName}", style = LareaType.subheadline, color = c.secondaryText, maxLines = 1)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
                Text(Money.format(order.amountCents, order.currency), style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.text)
                Pill(
                    primary?.title ?: order.status.label,
                    style = when {
                        primary != null -> PillStyle.Sunny
                        order.status == OrderStatus.COMPLETED -> PillStyle.Success
                        else -> PillStyle.Neutral
                    },
                )
            }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
    }
}

@Composable
private fun OfferItem(offer: Offer, perspective: OfferPerspective, busy: Boolean, store: DealsStore, onOpenListing: (String) -> Unit) {
    val c = Larea.colors
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.padding(horizontal = Spacing.screen, vertical = 6.dp).testTag("deals.offer.${offer.id}")) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onOpenListing(offer.listingId) }.padding(vertical = 4.dp),
        ) {
            RemoteImage(offer.listing.thumbnailUrl, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
            Text(offer.listing.title, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.text, maxLines = 1, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
        }
        OfferRow(
            offer, perspective, busy,
            onAccept = if (perspective == OfferPerspective.Owner) ({ store.accept(offer) }) else null,
            onDecline = if (perspective == OfferPerspective.Owner) ({ store.decline(offer) }) else null,
            onWithdraw = if (perspective == OfferPerspective.Offerer && offer.status == OfferStatus.PENDING) ({ store.withdraw(offer) }) else null,
        )
    }
}

