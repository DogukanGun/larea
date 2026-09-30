package com.larea.app.feature.market

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.core.format.Money
import com.larea.app.core.network.Listing
import com.larea.app.core.network.ListingCategory
import com.larea.app.core.network.ListingKind
import com.larea.app.ui.components.BottomPanel
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.FilterChip
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.ListingCard
import com.larea.app.ui.components.ListingCardLayout
import com.larea.app.ui.components.PanelDetent
import com.larea.app.ui.components.PriceTag
import com.larea.app.ui.components.PriceTagStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.components.icon
import com.larea.app.ui.components.rememberBottomPanelState
import com.larea.app.ui.map.LareaMap
import com.larea.app.ui.map.MapCircle
import com.larea.app.ui.map.UserDot
import com.larea.app.ui.map.placeAt
import com.larea.app.ui.map.rememberMapController
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Rounded
import com.larea.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/** Neighbourhood marketplace: listings within 2 km on a map or in a list. */
@Composable
fun MarketScreen(marketEnabled: Boolean, onOpenListing: (String) -> Unit, bottomInset: Dp, model: MarketViewModel = hiltViewModel()) {
    if (!marketEnabled) {
        Box(Modifier.fillMaxSize().background(Larea.colors.grouped).statusBarsPadding(), contentAlignment = Alignment.Center) {
            EmptyState(Icons.Filled.Storefront, "Market coming soon", description = "Buy, sell and ask for help within 2 km.", modifier = Modifier.testTag("market.root"))
        }
        return
    }
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val map = rememberMapController()
    val panel = rememberBottomPanelState(PanelDetent.Medium)
    var showFilters by remember { mutableStateOf(false) }
    var showCreate by remember { mutableStateOf(false) }
    var didFit by rememberSaveable { mutableStateOf(false) }

    DisposableEffect(Unit) {
        model.start()
        onDispose { model.stop() }
    }
    LaunchedEffect(panel.detent) { map.coveredFraction = if (panel.detent == PanelDetent.Small) 0.2f else 0.5f }
    LaunchedEffect(state.fix != null, map.ready, state.listings.isNotEmpty()) {
        val fix = state.fix ?: return@LaunchedEffect
        if (!map.ready || didFit) return@LaunchedEffect
        map.show(fix.lat, fix.lng, 2600.0, animated = state.listings.isNotEmpty())
        if (state.listings.isNotEmpty()) didFit = true
    }
    LaunchedEffect(state.selectedId) {
        val listing = state.selectedListing ?: return@LaunchedEffect
        map.show(listing.location.lat, listing.location.lng, 900.0)
        panel.detent = PanelDetent.Medium
    }

    Box(Modifier.fillMaxSize().background(c.grouped)) {
        if (state.mode == MarketMode.Map) {
            LareaMap(controller = map, modifier = Modifier.fillMaxSize(), attributionTopMargin = 180.dp) {
                state.fix?.let { fix ->
                    MapCircle(map, fix.lat, fix.lng, state.config.radiusM, c.brandPrimary, strokeAlpha = 0.35f, fillAlpha = 0.06f)
                    UserDot(map, fix.lat, fix.lng)
                }
                state.listings.forEach { listing ->
                    ListingPin(
                        listing,
                        selected = listing.id == state.selectedId,
                        modifier = Modifier.placeAt(map, listing.location.lat, listing.location.lng, anchorBottom = true),
                        onClick = { model.select(listing.id) },
                    )
                }
            }
            BottomPanel(
                state = panel,
                modifier = Modifier.padding(top = 128.dp),
                header = { PanelHeader(state) },
            ) {
                val selected = state.selectedListing
                if (selected != null) {
                    SelectedCard(selected, bottomInset, onClose = { model.select(null) }, onOpen = { onOpenListing(selected.id) })
                } else {
                    ListingList(state, model, bottomInset, onTap = { model.select(it.id) }, onCreate = { showCreate = true })
                }
            }
        } else {
            Column(Modifier.fillMaxSize().padding(top = 128.dp)) {
                ListingList(state, model, bottomInset, onTap = { onOpenListing(it.id) }, onCreate = { showCreate = true })
            }
        }
        TopBar(
            state = state,
            onMode = model::setMode,
            onFilters = { showFilters = true },
            onCreate = { showCreate = true },
            onQuery = { model.setFilters(state.filters.copy(query = it)) },
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }

    if (showFilters) {
        FilterSheet(state.filters, onDismiss = { showFilters = false }) {
            showFilters = false
            model.setFilters(it)
        }
    }
    if (showCreate) {
        ListingEditor(config = state.config, editing = null, onDismiss = { showCreate = false }) { listing ->
            showCreate = false
            model.insert(listing)
            onOpenListing(listing.id)
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
private fun TopBar(state: MarketUiState, onMode: (MarketMode) -> Unit, onFilters: () -> Unit, onCreate: () -> Unit, onQuery: (String) -> Unit, modifier: Modifier) {
    val c = Larea.colors
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Spacing.screen, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.shadow(4.dp, CircleShape).background(c.card, CircleShape).padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Icon(Icons.Filled.Storefront, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(22.dp))
                Text("Market", fontFamily = Rounded, fontWeight = FontWeight.Black, fontSize = 22.sp, color = c.text, modifier = Modifier.testTag("market.root"))
            }
            Box(Modifier.weight(1f))
            SingleChoiceSegmentedButtonRow(Modifier.size(width = 104.dp, height = 40.dp).testTag("market.mode")) {
                listOf(MarketMode.Map to Icons.Filled.Map, MarketMode.List to Icons.AutoMirrored.Filled.List).forEachIndexed { index, (mode, icon) ->
                    SegmentedButton(
                        selected = state.mode == mode,
                        onClick = { onMode(mode) },
                        shape = SegmentedButtonDefaults.itemShape(index, 2),
                        colors = SegmentedButtonDefaults.colors(activeContainerColor = c.brandTint, activeContentColor = c.brandPrimary, inactiveContainerColor = c.card),
                        icon = {},
                    ) { Icon(icon, contentDescription = if (mode == MarketMode.Map) "Map" else "List", modifier = Modifier.size(18.dp)) }
                }
            }
            Box {
                RoundButton(Icons.Filled.FilterList, "Filters", c.brandPrimary, c.card, "market.filter", onFilters)
                if (state.filters.isActive) Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(10.dp).background(c.sunny, CircleShape))
            }
            RoundButton(Icons.Filled.Add, "Post a listing", Color.White, c.brandPrimary, "market.create", onCreate)
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier.fillMaxWidth().shadow(4.dp, CircleShape).background(c.card, CircleShape).padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = c.secondaryText, modifier = Modifier.size(20.dp))
            Box(Modifier.weight(1f)) {
                if (state.filters.query.isEmpty()) Text("Search nearby listings", style = LareaType.body, color = c.tertiaryText)
                BasicTextField(
                    value = state.filters.query,
                    onValueChange = onQuery,
                    singleLine = true,
                    textStyle = LareaType.body.copy(color = c.text),
                    cursorBrush = SolidColor(c.brandPrimary),
                    modifier = Modifier.fillMaxWidth().testTag("market.search").semantics { contentDescription = "Search nearby listings" },
                )
            }
            if (state.filters.query.isNotEmpty()) {
                Icon(Icons.Filled.Cancel, contentDescription = "Clear search", tint = c.secondaryText, modifier = Modifier.size(20.dp).clickable { onQuery("") })
            }
        }
    }
}

@Composable
private fun RoundButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, tint: Color, background: Color, tag: String, onClick: () -> Unit) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(44.dp)
            .shadow(4.dp, CircleShape)
            .background(background, CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = label }
            .testTag(tag),
    ) { Icon(icon, contentDescription = null, tint = tint) }
}

/** Map annotation for a listing: the price in a capsule, the title when selected. */
@Composable
private fun ListingPin(listing: Listing, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = Larea.colors
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = "${listing.title}, ${Money.format(listing.priceCents, listing.currency)}" }
            .testTag("market.pin.${listing.id}"),
    ) {
        PriceTag(
            listing.priceCents,
            currency = listing.currency,
            large = selected,
            style = if (selected) PriceTagStyle.Sunny else if (listing.kind == ListingKind.REQUEST) PriceTagStyle.Plain else PriceTagStyle.Filled,
        )
        if (selected) {
            Text(
                listing.title,
                style = LareaType.caption2.copy(fontWeight = FontWeight.SemiBold),
                color = c.text,
                maxLines = 1,
                modifier = Modifier.background(c.card.copy(alpha = 0.95f), CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun PanelHeader(state: MarketUiState) {
    val c = Larea.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.l)) {
        val listing = state.selectedListing
        if (listing != null) {
            Text(listing.title, style = LareaType.headline, color = c.text, maxLines = 1, modifier = Modifier.weight(1f))
        } else {
            Box(Modifier.size(8.dp).background(if (state.locating) c.secondaryText else c.success, CircleShape))
            Text(
                when {
                    state.locating -> "Finding your location…"
                    state.listings.isEmpty() -> "Nothing nearby yet"
                    else -> "${state.listings.size} within 2 km"
                },
                style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = c.text,
                modifier = Modifier.weight(1f),
            )
        }
        if (state.loading) CircularProgressIndicator(strokeWidth = 2.dp, color = c.secondaryText, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun SelectedCard(listing: Listing, bottomInset: Dp, onClose: () -> Unit, onOpen: () -> Unit) {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.l),
        modifier = Modifier.fillMaxWidth().animateContentSize().padding(horizontal = Spacing.screen).padding(top = Spacing.s, bottom = bottomInset + Spacing.l),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            ListingCard(listing, Modifier.weight(1f), ListingCardLayout.Row)
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(30.dp).background(c.fill, CircleShape).clickable(onClick = onClose).semantics { contentDescription = "Close" },
            ) { Icon(Icons.Filled.Close, contentDescription = null, tint = c.secondaryText, modifier = Modifier.size(16.dp)) }
        }
        if (listing.description.isNotEmpty()) Text(listing.description, style = LareaType.subheadline, color = c.secondaryText, maxLines = 3)
        PrimaryButton(if (listing.mine) "Manage listing" else "View listing", onClick = onOpen, tag = "market.listing.open")
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ListingList(state: MarketUiState, model: MarketViewModel, bottomInset: Dp, onTap: (Listing) -> Unit, onCreate: () -> Unit) {
    val c = Larea.colors
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { scope.launch { refreshing = true; model.refresh(); refreshing = false } },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(contentPadding = PaddingValues(top = Spacing.s, bottom = bottomInset + Spacing.l), modifier = Modifier.fillMaxSize()) {
            item {
                GroupedCard {
                    when {
                        state.locating || (state.loading && state.listings.isEmpty()) -> repeat(3) { index ->
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(horizontal = Spacing.l, vertical = 12.dp)) {
                                Box(Modifier.size(72.dp).background(c.fill, RoundedCornerShape(14.dp)))
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Box(Modifier.size(180.dp, 16.dp).background(c.fill, RoundedCornerShape(4.dp)))
                                    Box(Modifier.size(120.dp, 12.dp).background(c.fill, RoundedCornerShape(4.dp)))
                                    Box(Modifier.size(70.dp, 20.dp).background(c.fill, CircleShape))
                                }
                            }
                            if (index < 2) RowDivider(inset = 100)
                        }
                        state.listings.isEmpty() && state.error != null -> EmptyState(Icons.Filled.WifiOff, "Can't load listings", description = state.error) {
                            Button(onClick = model::refreshNow, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Retry") }
                        }
                        state.listings.isEmpty() && (state.filters.isActive || state.filters.query.isNotEmpty()) ->
                            EmptyState(Icons.Filled.FilterList, "No matches", description = "Nothing within 2 km matches these filters.") {
                                OutlinedButton(onClick = { model.setFilters(MarketFilters()) }) { Text("Clear filters", color = c.brandPrimary) }
                            }
                        state.listings.isEmpty() -> EmptyState(Icons.Filled.Storefront, "Nothing nearby yet", description = "Be the first: sell something or ask neighbours for help.") {
                            Button(onClick = onCreate, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Post the first listing") }
                        }
                        else -> state.listings.forEachIndexed { index, listing ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth().clickable { onTap(listing) }.padding(horizontal = Spacing.l, vertical = 8.dp).testTag("market.listing.${listing.id}"),
                            ) {
                                ListingCard(listing, Modifier.weight(1f), ListingCardLayout.Row)
                                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
                            }
                            if (index < state.listings.lastIndex) RowDivider(inset = 100)
                        }
                    }
                }
                if (state.listings.isNotEmpty()) SectionFooter("Locations are approximate. Meet in a public place for handovers.")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FilterSheet(filters: MarketFilters, onDismiss: () -> Unit, onApply: (MarketFilters) -> Unit) {
    val c = Larea.colors
    var draft by remember { mutableStateOf(filters) }
    var minText by remember { mutableStateOf(filters.minCents?.let { (it / 100).toString() } ?: "") }
    var maxText by remember { mutableStateOf(filters.maxCents?.let { (it / 100).toString() } ?: "") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.grouped) {
        Column(Modifier.exposeTestTags().fillMaxWidth().imePadding().navigationBarsPadding()) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s)) {
                TextButton(onClick = {
                    draft = MarketFilters(query = draft.query)
                    minText = ""
                    maxText = ""
                }) { Text("Reset") }
                Text("Filters", style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                TextButton(
                    onClick = { onApply(draft.copy(minCents = Money.parse(minText), maxCents = Money.parse(maxText))) },
                    modifier = Modifier.testTag("market.filter.apply"),
                ) { Text("Show results", fontWeight = FontWeight.SemiBold) }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Spacing.xl)) {
                SectionHeader("What")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.padding(horizontal = Spacing.screen)) {
                    FilterChip("All", draft.kind == null, { draft = draft.copy(kind = null) })
                    FilterChip("Selling", draft.kind == ListingKind.OFFER, { draft = draft.copy(kind = ListingKind.OFFER) }, icon = Icons.Filled.Sell)
                    FilterChip("Help wanted", draft.kind == ListingKind.REQUEST, { draft = draft.copy(kind = ListingKind.REQUEST) }, icon = Icons.Filled.VolunteerActivism)
                }
                SectionHeader("Category")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.padding(horizontal = Spacing.screen)) {
                    FilterChip("Any", draft.category == null, { draft = draft.copy(category = null) })
                    ListingCategory.selectable.forEach { category ->
                        FilterChip(category.label, draft.category == category, { draft = draft.copy(category = category) }, icon = category.icon)
                    }
                }
                SectionHeader("Price")
                GroupedCard {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.padding(Spacing.m)) {
                        LareaField("Min", minText, { minText = it }, keyboardType = KeyboardType.Decimal, tag = "market.filter.min", modifier = Modifier.weight(1f))
                        Text("–", color = c.secondaryText, modifier = Modifier.padding(bottom = 16.dp))
                        LareaField("Max", maxText, { maxText = it }, keyboardType = KeyboardType.Decimal, tag = "market.filter.max", modifier = Modifier.weight(1f))
                    }
                }
                SectionHeader("Sort")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = Spacing.screen)) {
                    MarketFilters.Sort.entries.forEachIndexed { index, sort ->
                        SegmentedButton(
                            selected = draft.sort == sort,
                            onClick = { draft = draft.copy(sort = sort) },
                            shape = SegmentedButtonDefaults.itemShape(index, MarketFilters.Sort.entries.size),
                            colors = SegmentedButtonDefaults.colors(activeContainerColor = c.brandTint, activeContentColor = c.brandDeep),
                            icon = {},
                        ) { Text(sort.label) }
                    }
                }
            }
        }
    }
}
