package com.larea.app.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Euro
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.format.Validation
import com.larea.app.core.network.BlockedUser
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Listing
import com.larea.app.core.network.MeView
import com.larea.app.core.network.StripeAccountStatus
import com.larea.app.core.network.StripeStatus
import com.larea.app.core.network.apiCall
import com.larea.app.solana.LocalSolanaUi
import com.larea.app.core.network.userMessage
import com.larea.app.ui.components.Avatar
import com.larea.app.ui.components.EmptyState
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.ListRow
import com.larea.app.ui.components.ListingCard
import com.larea.app.ui.components.ListingCardLayout
import com.larea.app.ui.components.OnResume
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileState(
    val blocks: List<BlockedUser> = emptyList(),
    val stripe: StripeAccountStatus? = null,
    val listingCount: Int? = null,
    val listings: List<Listing> = emptyList(),
    val listingsLoaded: Boolean = false,
    val busy: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(private val api: LareaApi, private val sessions: SessionRepository) : ViewModel() {
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state
    val me: StateFlow<MeView?> = sessions.session.map { it?.user }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun load(market: Boolean) {
        viewModelScope.launch { apiCall { api.blocks() }.onSuccess { r -> _state.update { it.copy(blocks = r.blocks) } } }
        if (!market) return
        viewModelScope.launch { apiCall { api.stripeAccount() }.onSuccess { s -> _state.update { it.copy(stripe = s) } } }
        viewModelScope.launch { loadListings() }
    }

    suspend fun loadListings() {
        apiCall { api.marketMe() }.onSuccess { m -> _state.update { it.copy(listingCount = m.listings.size, listings = m.listings) } }
        _state.update { it.copy(listingsLoaded = true) }
    }

    private fun run(work: suspend () -> String?) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val message = runCatching { work() }.getOrElse { it.userMessage() }
            _state.update { it.copy(busy = false, message = message) }
        }
    }

    fun saveDisplayName(name: String) = run { sessions.updateDisplayName(name).getOrThrow(); "Saved." }

    fun unblock(user: BlockedUser) = run {
        apiCall { api.unblock(user.id) }.getOrThrow()
        apiCall { api.blocks() }.onSuccess { r -> _state.update { it.copy(blocks = r.blocks) } }
        "Unblocked."
    }

    fun signOut() = run { sessions.signOut(); null }
    fun deleteAccount() = run { sessions.deleteAccount().getOrThrow(); null }
    fun dismissMessage() = _state.update { it.copy(message = null) }
}

@Composable
fun ProfileScreen(onPayouts: () -> Unit, onMyListings: () -> Unit, bottomInset: Dp, model: ProfileViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val me by model.me.collectAsStateWithLifecycle()
    val c = Larea.colors
    val user = me ?: return
    val current = user.displayName
    var name by rememberSaveable(current) { mutableStateOf(current) }
    var confirmDelete by remember { mutableStateOf(false) }
    val nameError = if (name.trim() == current) null else Validation.displayName(name)
    val market = user.capabilities.market

    LaunchedEffect(market) { model.load(market) }
    OnResume { model.load(market) }

    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar("Profile")
        Column(Modifier.weight(1f).imePadding().verticalScroll(rememberScrollState()).padding(bottom = bottomInset + Spacing.l)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.l), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = Spacing.screen, vertical = Spacing.m)) {
                Avatar(current, user.id, size = 64.dp)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(current, style = LareaType.title3, color = c.text, modifier = Modifier.testTag("profile.name"))
                    Text(user.email, style = LareaType.subheadline, color = c.secondaryText)
                    if (user.ageVerified) Pill("18+ verified", style = PillStyle.Success, icon = Icons.Filled.Verified)
                }
            }
            SectionHeader("Display name")
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(horizontal = Spacing.screen)) {
                LareaField("Shown to people in chats", name, { name = it }, placeholder = "Display name", error = nameError, imeAction = ImeAction.Done, tag = "profile.displayName")
                PrimaryButton("Save", onClick = { model.saveDisplayName(name) }, loading = state.busy, enabled = nameError == null && name.trim() != current, tag = "profile.save")
            }
            if (market) {
                SectionHeader("Marketplace")
                GroupedCard {
                    if (user.capabilities.payments) {
                        ListRow(onClick = onPayouts, tag = "profile.payouts") {
                            Icon(Icons.Filled.Euro, contentDescription = null, tint = c.brandPrimary)
                            Text("Payouts", style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
                            state.stripe?.let { stripe ->
                                Pill(
                                    stripe.status.label,
                                    style = when (stripe.status) {
                                        StripeStatus.READY -> PillStyle.Success
                                        StripeStatus.PENDING -> PillStyle.Sunny
                                        StripeStatus.NOT_SET_UP -> PillStyle.Neutral
                                    },
                                )
                            }
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
                        }
                        RowDivider(inset = 56)
                    }
                    ListRow(onClick = onMyListings, tag = "profile.listings") {
                        Icon(Icons.Filled.Storefront, contentDescription = null, tint = c.brandPrimary)
                        Text("My listings", style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
                        state.listingCount?.let { Text("$it", style = LareaType.body, color = c.secondaryText) }
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
                    }
                }
            }
            LocalSolanaUi.current.ProfileSection()
            SectionHeader("Blocked people")
            GroupedCard {
                if (state.blocks.isEmpty()) {
                    ListRow { Text("You haven't blocked anyone.", style = LareaType.body, color = c.secondaryText) }
                }
                state.blocks.forEachIndexed { index, blocked ->
                    ListRow {
                        Avatar(blocked.displayName, blocked.id, size = 32.dp)
                        Text(blocked.displayName, style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
                        TextButton(onClick = { model.unblock(blocked) }, enabled = !state.busy) { Text("Unblock", fontWeight = FontWeight.SemiBold) }
                    }
                    if (index < state.blocks.lastIndex) RowDivider(inset = 60)
                }
            }
            SectionHeader("")
            GroupedCard {
                ListRow(onClick = { if (!state.busy) model.signOut() }, tag = "profile.signout") { Text("Sign out", style = LareaType.body, color = c.brandPrimary) }
                RowDivider()
                ListRow(onClick = { if (!state.busy) confirmDelete = true }, tag = "profile.delete") { Text("Delete account", style = LareaType.body, color = c.danger) }
            }
            SectionFooter("Deleting removes your profile immediately. Chats are ephemeral and are purged automatically.")
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete account", style = LareaType.headline) },
            text = { Text("Delete your account? Your profile is removed immediately and cannot be restored.") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; model.deleteAccount() }) { Text("Delete", color = c.danger) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
    state.message?.let { message ->
        AlertDialog(
            onDismissRequest = model::dismissMessage,
            title = { Text("Profile", style = LareaType.headline) },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = model::dismissMessage) { Text("OK") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyListingsScreen(onBack: () -> Unit, onOpenListing: (String) -> Unit, onGoToMarket: () -> Unit, bottomInset: Dp, model: ProfileViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.loadListings() }
    Column(Modifier.fillMaxSize().background(c.grouped)) {
        LareaTopBar("My listings", onBack = onBack)
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = { scope.launch { refreshing = true; model.loadListings(); refreshing = false } }) {
            LazyColumn(contentPadding = PaddingValues(top = Spacing.s, bottom = bottomInset + Spacing.l), modifier = Modifier.fillMaxSize()) {
                item {
                    when {
                        !state.listingsLoaded -> Box(Modifier.fillMaxWidth().padding(Spacing.xl))
                        state.listings.isEmpty() -> EmptyState(Icons.Filled.Storefront, "No listings yet", description = "Sell something or ask neighbours for help from the Market tab.") {
                            Button(onClick = onGoToMarket, colors = ButtonDefaults.buttonColors(containerColor = c.brandPrimary)) { Text("Go to Market") }
                        }
                        else -> GroupedCard {
                            state.listings.forEachIndexed { index, listing ->
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth().clickable { onOpenListing(listing.id) }.padding(horizontal = Spacing.l, vertical = 8.dp).testTag("profile.listing.${listing.id}"),
                                ) {
                                    ListingCard(listing, Modifier.weight(1f), ListingCardLayout.Row)
                                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = c.tertiaryText)
                                }
                                if (index < state.listings.lastIndex) RowDivider(inset = 100)
                            }
                        }
                    }
                }
            }
        }
    }
}

