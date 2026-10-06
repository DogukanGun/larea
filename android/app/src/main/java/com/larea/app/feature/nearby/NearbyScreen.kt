package com.larea.app.feature.nearby

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.core.network.ActiveMembership
import com.larea.app.core.network.NearbyVenue
import com.larea.app.feature.pins.PinComposerSheet
import com.larea.app.feature.pins.PinComposerViewModel
import com.larea.app.solana.LocalSolanaUi
import com.larea.app.ui.components.BottomPanel
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.LogoMark
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.PanelDetent
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SecondaryButton
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.VenueIcon
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

/** Home screen: a map of real places around the user with a bottom panel to pick and join. */
@Composable
fun NearbyScreen(
    activeChatName: String?,
    membership: ActiveMembership?,
    onShowActiveChat: () -> Unit,
    onJoined: (venueId: String, venueName: String) -> Unit,
    bottomInset: androidx.compose.ui.unit.Dp,
    pinsEnabled: Boolean = false,
    onOpenPin: (String) -> Unit = {},
    model: NearbyViewModel = hiltViewModel(),
    composer: PinComposerViewModel = hiltViewModel(),
) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val map = rememberMapController()
    val panel = rememberBottomPanelState(PanelDetent.Medium)
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var didFit by rememberSaveable { mutableStateOf(false) }
    // The map starts on a world view; its camera only means something once it is centred on the user.
    var centered by remember { mutableStateOf(false) }

    LaunchedEffect(panel.detent) {
        map.coveredFraction = when (panel.detent) {
            PanelDetent.Small -> 0.2f
            else -> 0.5f
        }
    }
    var composing by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        model.start()
        onDispose { model.stop() }
    }
    LaunchedEffect(pinsEnabled) {
        model.pinsEnabled = pinsEnabled
        if (pinsEnabled) model.refreshNow()
    }

    fun compose(lat: Double, lng: Double) {
        if (!pinsEnabled) return
        composer.begin(lat, lng)
        composing = true
    }

    fun join(venueId: String, venueName: String) {
        scope.launch {
            if (model.join(venueId)) {
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                onJoined(venueId, venueName)
            }
        }
    }

    // On the first result, fit the camera to the eight nearest places.
    LaunchedEffect(state.venues.map { it.id }, map.ready) {
        val fix = state.fix ?: return@LaunchedEffect
        if (didFit || state.venues.isEmpty() || !map.ready) return@LaunchedEffect
        didFit = true
        val span = maxOf(500.0, (state.venues.take(8).maxOfOrNull { it.distanceM } ?: 500) * 2.4)
        map.show(fix.lat, fix.lng, span)
    }
    // First fix before any places: centre on the user.
    LaunchedEffect(state.fix != null, map.ready) {
        val fix = state.fix ?: return@LaunchedEffect
        if (map.ready && !centered) {
            map.show(fix.lat, fix.lng, 1500.0, animated = false)
            centered = true
        }
    }
    LaunchedEffect(state.selectedId) {
        val venue = state.selectedVenue ?: return@LaunchedEffect
        map.show(venue.lat, venue.lng, 700.0)
        panel.detent = PanelDetent.Medium
    }

    Box(Modifier.fillMaxSize().background(c.grouped)) {
        LareaMap(
            controller = map,
            modifier = Modifier.fillMaxSize(),
            onCameraIdle = { if (centered) model.mapMoved(it) },
            onMapLongClick = if (pinsEnabled) { lat, lng ->
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                compose(lat, lng)
            } else null,
        ) {
            state.selectedVenue?.let { MapCircle(map, it.lat, it.lng, 200.0, c.brandPrimary) }
            state.fix?.let { UserDot(map, it.lat, it.lng) }
            state.venues.forEach { venue ->
                VenuePin(
                    venue = venue,
                    selected = venue.id == state.selectedId,
                    modifier = Modifier.placeAt(map, venue.lat, venue.lng),
                    onClick = { model.select(venue.id) },
                )
            }
            state.pins.forEach { pin ->
                PinMarker(
                    mine = pin.mine,
                    modifier = Modifier
                        .placeAt(map, pin.lat, pin.lng, anchorBottom = true)
                        .clickable { onOpenPin(pin.id) }
                        .semantics { contentDescription = "Pinned message: ${pin.text}" }
                        .testTag("nearby.pin.${pin.id}"),
                )
            }
        }
        TopBar(Modifier.align(Alignment.TopStart))
        if (pinsEnabled) {
            PinButton(
                onClick = {
                    // The map centre, or where we are before the map has reported a camera.
                    val view = state.viewport
                    val fix = state.fix
                    if (view != null) compose(view.lat, view.lng) else if (fix != null) compose(fix.lat, fix.lng)
                },
                modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 60.dp, end = Spacing.screen),
            )
        }
        MyLocationButton(
            onClick = { state.fix?.let { map.show(it.lat, it.lng, 1000.0) } },
            modifier = Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 8.dp, end = Spacing.screen),
        )
        BottomPanel(
            state = panel,
            modifier = Modifier.padding(bottom = 0.dp),
            header = {
                PanelHeader(
                    state = state,
                    activeChatName = activeChatName,
                    membership = membership,
                    onShowActiveChat = onShowActiveChat,
                    onRejoin = { m -> join(m.venueId, m.venueName) },
                )
            },
        ) {
            val selected = state.selectedVenue
            if (selected != null) {
                VenueCard(
                    venue = selected,
                    joining = state.joining == selected.id,
                    step = state.joiningStep.takeIf { state.joining == selected.id },
                    stamps = state.stamps,
                    onJoin = { join(selected.id, selected.name) },
                    onClose = { model.select(null) },
                    bottomInset = bottomInset,
                )
            } else {
                VenueList(state, bottomInset, onSelect = { model.select(it) }, onRefresh = { model.refresh() })
            }
        }
    }

    if (composing) {
        PinComposerSheet(
            model = composer,
            onDismiss = { composing = false },
            onPinned = { pin ->
                model.add(pin)
                onOpenPin(pin.id)
            },
        )
    }

    state.notice?.let { notice ->
        AlertDialog(
            onDismissRequest = model::dismissNotice,
            title = { Text("Not quite there", style = LareaType.headline) },
            text = { Text(notice) },
            confirmButton = { TextButton(onClick = model::dismissNotice) { Text("OK") } },
        )
    }
}

@Composable
private fun TopBar(modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier
            .statusBarsPadding()
            .padding(horizontal = Spacing.screen, vertical = 8.dp)
            .shadow(4.dp, CircleShape)
            .background(c.card.copy(alpha = 0.96f), CircleShape)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        LogoMark(size = 26.dp)
        Text("Larea", fontFamily = Rounded, fontWeight = FontWeight.Black, fontSize = 22.sp, color = c.text, modifier = Modifier.testTag("nearby.root"))
    }
}

@Composable
private fun PinButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier
            .shadow(4.dp, CircleShape)
            .background(c.sunny, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp)
            .semantics { contentDescription = "Pin a message at the centre of the map. You can also long-press the map." }
            .testTag("nearby.pinMessage"),
    ) {
        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = c.onSunny, modifier = Modifier.size(18.dp))
        Text("Pin a message", style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.onSunny)
    }
}

/** The map marker for a message pin: a speech bubble, unlike the round place markers. */
@Composable
private fun PinMarker(mine: Boolean, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(36.dp)
            .shadow(4.dp, RoundedCornerShape(12.dp))
            .background(c.sunny, RoundedCornerShape(12.dp))
            .border(2.dp, if (mine) c.brandPrimary else Color.White, RoundedCornerShape(12.dp)),
    ) {
        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = c.onSunny, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun MyLocationButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(44.dp)
            .shadow(4.dp, CircleShape)
            .background(c.card, CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = "Show my location" },
    ) {
        Icon(Icons.Filled.MyLocation, contentDescription = null, tint = c.brandPrimary)
    }
}

@Composable
private fun VenuePin(venue: NearbyVenue, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = Larea.colors
    val size by animateDpAsState(if (selected) 44.dp else 34.dp, label = "pin")
    val filled = venue.eligible || selected
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = "${venue.name}, ${venue.category.label}${if (venue.eligible) ", nearby" else ""}"
            }
            .testTag("pin.${venue.id}"),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(size)
                .shadow(4.dp, CircleShape)
                .background(if (filled) c.brandPrimary else c.card, CircleShape)
                .border(2.dp, Color.White, CircleShape),
        ) {
            Icon(venue.category.icon, contentDescription = null, tint = if (filled) Color.White else c.brandPrimary, modifier = Modifier.size(if (selected) 22.dp else 18.dp))
        }
        if (selected) {
            Text(
                venue.name,
                style = LareaType.caption2.copy(fontWeight = FontWeight.SemiBold),
                color = c.text,
                maxLines = 1,
                modifier = Modifier.background(c.card.copy(alpha = 0.95f), CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

@Composable
private fun PanelHeader(
    state: NearbyUiState,
    activeChatName: String?,
    membership: ActiveMembership?,
    onShowActiveChat: () -> Unit,
    onRejoin: (ActiveMembership) -> Unit,
) {
    val c = Larea.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Spacing.s)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.l)) {
            val venue = state.selectedVenue
            if (venue != null) {
                Text(venue.name, style = LareaType.headline, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            } else {
                Box(Modifier.size(8.dp).background(if (state.locating) c.secondaryText else c.success, CircleShape))
                Text(
                    when {
                        state.locating -> "Finding your location…"
                        state.discovering -> "Discovering places…"
                        state.viewingElsewhere -> "Places on the map"
                        else -> "Around you right now"
                    },
                    style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    color = c.text,
                    modifier = Modifier.weight(1f),
                )
            }
            if (state.loading || state.discovering) CircularProgressIndicator(strokeWidth = 2.dp, color = c.secondaryText, modifier = Modifier.size(16.dp))
        }
        when {
            activeChatName != null -> Pill(
                "Back to $activeChatName",
                style = PillStyle.Sunny,
                icon = Icons.AutoMirrored.Filled.Chat,
                modifier = Modifier.clickable(onClick = onShowActiveChat).testTag("nearby.activeChip"),
            )
            membership != null && state.joining == null -> Pill(
                "Rejoin ${membership.venueName}",
                style = PillStyle.Sunny,
                icon = Icons.AutoMirrored.Filled.Undo,
                modifier = Modifier.clickable { onRejoin(membership) }.testTag("nearby.rejoin"),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VenueList(state: NearbyUiState, bottomInset: androidx.compose.ui.unit.Dp, onSelect: (String) -> Unit, onRefresh: suspend () -> Unit) {
    val c = Larea.colors
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { scope.launch { refreshing = true; onRefresh(); refreshing = false } },
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(contentPadding = PaddingValues(top = Spacing.s, bottom = bottomInset + Spacing.l), modifier = Modifier.fillMaxSize()) {
            item {
                GroupedCard {
                    when {
                        state.locating || (state.loading && state.venues.isEmpty()) -> repeat(3) { index ->
                            PlaceholderRow()
                            if (index < 2) RowDivider(inset = 72)
                        }
                        state.venues.isEmpty() && state.error != null -> EmptyState(
                            Icons.Filled.WifiOff,
                            "Can't load places",
                            description = state.error,
                        ) {
                            Button(
                                onClick = { scope.launch { onRefresh() } },
                                colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary),
                            ) { Text("Retry") }
                        }
                        state.venues.isEmpty() && state.discovering -> Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Spacing.m),
                            modifier = Modifier.padding(Spacing.l),
                        ) {
                            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(22.dp), color = c.brandPrimary)
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    if (state.viewingElsewhere) "Looking for places in this area…" else "Looking for places around you…",
                                    style = LareaType.headline,
                                    color = c.text,
                                )
                                Text("First look at this area: fetching libraries, stations, squares and more.", style = LareaType.caption, color = c.secondaryText)
                            }
                        }
                        state.venues.isEmpty() -> EmptyState(
                            Icons.Filled.LocationOff,
                            "No places around here",
                            description = when {
                                state.degraded -> "The place service is busy right now. Pull to try again."
                                state.zoomedOut -> "Zoom in or move the map to find libraries, stations, squares and parks."
                                else -> "Chats live at libraries, stations, squares, parks and other public places. Move the map or pull to refresh."
                            },
                        )
                        else -> state.venues.forEachIndexed { index, venue ->
                            VenueRow(venue, Modifier.clickable { onSelect(venue.id) }.testTag("venue.${venue.id}"))
                            if (index < state.venues.lastIndex) RowDivider(inset = 72)
                        }
                    }
                }
                SectionFooter(if (state.zoomedOut) "Zoom in to see cafés. ${state.attribution}" else state.attribution)
            }
        }
    }
}

@Composable
private fun PlaceholderRow() {
    val c = Larea.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(horizontal = Spacing.l, vertical = 12.dp)) {
        Box(Modifier.size(44.dp).background(c.fill, CircleShape))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(width = 160.dp, height = 14.dp).background(c.fill, RoundedCornerShape(4.dp)))
            Box(Modifier.size(width = 220.dp, height = 12.dp).background(c.fill, RoundedCornerShape(4.dp)))
            Box(Modifier.size(width = 90.dp, height = 10.dp).background(c.fill, RoundedCornerShape(4.dp)))
        }
    }
}

@Composable
private fun VenueRow(venue: NearbyVenue, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = modifier
            .fillMaxWidth()
            .alpha(if (venue.eligible) 1f else 0.75f)
            .padding(horizontal = Spacing.l, vertical = 10.dp)
            .semantics(mergeDescendants = true) { },
    ) {
        VenueIcon(venue.category, dimmed = !venue.eligible)
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text(venue.name, style = LareaType.headline, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(venue.category.label, venue.address).joinToString(" · "), style = LareaType.subheadline, color = c.secondaryText, maxLines = 1)
            Text("${venue.memberCount} here · ${venue.distanceText}", style = LareaType.caption, color = c.secondaryText)
        }
        if (venue.eligible) {
            Pill("Nearby", style = PillStyle.Sunny, icon = Icons.Filled.NearMe)
        } else {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
        }
    }
}

@Composable
private fun VenueCard(venue: NearbyVenue, joining: Boolean, step: String?, stamps: Boolean, onJoin: () -> Unit, onClose: () -> Unit, bottomInset: androidx.compose.ui.unit.Dp) {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.l),
        modifier = Modifier.fillMaxWidth().animateContentSize().padding(horizontal = Spacing.screen).padding(top = Spacing.s, bottom = bottomInset + Spacing.l),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m)) {
            VenueIcon(venue.category, size = 52.dp, dimmed = !venue.eligible)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                Text(venue.name, style = LareaType.title3, color = c.text, maxLines = 2)
                Text(listOfNotNull(venue.category.label, venue.address).joinToString(" · "), style = LareaType.subheadline, color = c.secondaryText)
            }
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(30.dp).background(c.fill, CircleShape).clickable(onClick = onClose).semantics { contentDescription = "Close" },
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = c.secondaryText, modifier = Modifier.size(16.dp))
            }
        }
        LocalSolanaUi.current.VenuePerks(venue.id)
        Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m)) {
            Label(Icons.Filled.People, if (venue.memberCount == 1) "1 person here" else "${venue.memberCount} people here")
            Label(Icons.Filled.NearMe, "${venue.distanceText} away")
        }
        if (venue.eligible) {
            PrimaryButton(if (stamps) "Check in & join" else "Join chat", onClick = onJoin, loading = joining, tag = "venue.card.join")
            step?.let { Text(it, style = LareaType.subheadline, color = c.secondaryText, modifier = Modifier.fillMaxWidth().testTag("venue.card.step")) }
        } else {
            NoteCard(Icons.AutoMirrored.Filled.DirectionsWalk, "Get within 200 m of this place to join its chat. You're about ${venue.distanceText} away.")
            SecondaryButton("Try to join anyway", onClick = onJoin, tag = "venue.card.join")
        }
        Spacer(Modifier.size(0.dp))
    }
}

@Composable
private fun Label(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    val c = Larea.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Icon(icon, contentDescription = null, tint = c.secondaryText, modifier = Modifier.size(16.dp))
        Text(text, style = LareaType.subheadline, color = c.secondaryText)
    }
}
