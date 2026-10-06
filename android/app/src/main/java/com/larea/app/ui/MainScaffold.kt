package com.larea.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import com.larea.app.feature.chat.ChatScreen
import com.larea.app.feature.deals.DealsScreen
import com.larea.app.feature.deals.OrderDetailScreen
import com.larea.app.feature.market.ListingDetailScreen
import com.larea.app.feature.market.MarketScreen
import com.larea.app.feature.nearby.NearbyScreen
import com.larea.app.feature.payouts.PayoutsScreen
import com.larea.app.feature.profile.MyListingsScreen
import com.larea.app.feature.profile.ProfileScreen
import com.larea.app.ui.navigation.AppTab
import com.larea.app.ui.navigation.ChatRoute
import com.larea.app.ui.navigation.DealsGraph
import com.larea.app.ui.navigation.DealsHome
import com.larea.app.ui.navigation.DealsListing
import com.larea.app.ui.navigation.DealsOrder
import com.larea.app.ui.navigation.MarketGraph
import com.larea.app.ui.navigation.MarketHome
import com.larea.app.ui.navigation.MarketListing
import com.larea.app.ui.navigation.NavRequest
import com.larea.app.ui.navigation.NearbyGraph
import com.larea.app.ui.navigation.NearbyHome
import com.larea.app.ui.navigation.NearbyPin
import com.larea.app.feature.pins.PinChatScreen
import com.larea.app.ui.navigation.ProfileGraph
import com.larea.app.ui.navigation.ProfileHome
import com.larea.app.ui.navigation.ProfileListing
import com.larea.app.ui.navigation.ProfileMyListings
import com.larea.app.ui.navigation.ProfilePayouts
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class TabItem(val tab: AppTab, val label: String, val icon: ImageVector, val graph: Any, val tag: String)

private val tabs = listOf(
    TabItem(AppTab.Nearby, "Nearby", Icons.Filled.Map, NearbyGraph, "tab.nearby"),
    TabItem(AppTab.Market, "Market", Icons.Filled.Storefront, MarketGraph, "tab.market"),
    TabItem(AppTab.Deals, "Deals", Icons.Filled.Sell, DealsGraph, "tab.deals"),
    TabItem(AppTab.Profile, "Profile", Icons.Filled.AccountCircle, ProfileGraph, "tab.profile"),
)

/**
 * Four tabs, each with its own back stack. The realtime connection lives as long as this screen so
 * badges and member lists stay live outside the chat (iOS `MainFlowView`).
 */
@Composable
fun MainScaffold(root: RootViewModel) {
    val router = root.router
    val nav = rememberNavController()
    val me by root.me.collectAsStateWithLifecycle()
    val activeChat by router.activeChat.collectAsStateWithLifecycle()
    val backStack by nav.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val inChat = destination?.hasRoute<ChatRoute>() == true || destination?.hasRoute<NearbyPin>() == true
    val deals by root.deals.state.collectAsStateWithLifecycle()
    val market = me?.capabilities?.market == true
    val dealsBadge = if (market) deals.attentionCount else 0
    LaunchedEffect(market) { if (market) root.deals.start() else root.deals.stop() }

    DisposableEffect(Unit) {
        root.mainShown()
        onDispose { root.mainHidden() }
    }
    LaunchedEffect(nav) {
        // Navigation must happen on the main thread whoever asked (UI tests run effects on a test dispatcher).
        router.requests.collect { request -> withContext(Dispatchers.Main.immediate) { handle(nav, request) } }
    }

    Scaffold(
        containerColor = Larea.colors.grouped,
        bottomBar = {
            if (!inChat) {
                NavigationBar(containerColor = Larea.colors.card, tonalElevation = 0.dp) {
                    tabs.forEach { item ->
                        val selected = destination?.hierarchy?.any { it.hasRoute(item.graph::class) } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = { selectTab(nav, item.tab); router.selectTab(item.tab) },
                            icon = {
                                if (item.tab == AppTab.Deals && dealsBadge > 0) {
                                    BadgedBox(badge = { Badge(containerColor = Larea.colors.danger) { Text("$dealsBadge") } }) { Icon(item.icon, contentDescription = null) }
                                } else {
                                    Icon(item.icon, contentDescription = null)
                                }
                            },
                            label = { Text(item.label, style = LareaType.caption.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Larea.colors.brandPrimary,
                                selectedTextColor = Larea.colors.brandPrimary,
                                indicatorColor = Larea.colors.brandTint,
                                unselectedIconColor = Larea.colors.secondaryText,
                                unselectedTextColor = Larea.colors.secondaryText,
                            ),
                            modifier = Modifier.testTag(item.tag),
                        )
                    }
                }
            }
        },
    ) { padding ->
        val bottomInset: Dp = padding.calculateBottomPadding()
        NavHost(nav, startDestination = NearbyGraph, modifier = Modifier.fillMaxSize()) {
            navigation<NearbyGraph>(startDestination = NearbyHome) {
                composable<NearbyHome> {
                    NearbyScreen(
                        activeChatName = activeChat?.venueName,
                        membership = me?.activeMembership,
                        onShowActiveChat = router::showActiveChat,
                        onJoined = { id, name -> router.openChat(root.chats.create(id), id, name) },
                        bottomInset = bottomInset,
                        pinsEnabled = me?.capabilities?.pins == true,
                        onOpenPin = router::openPin,
                    )
                }
                composable<NearbyPin> {
                    PinChatScreen(onBack = { nav.popBackStack() })
                }
                composable<ChatRoute> {
                    val chat = activeChat
                    if (chat != null) {
                        ChatScreen(
                            session = chat.session,
                            venueName = chat.venueName,
                            onLeft = router::endChat,
                            onBack = { nav.popBackStack() },
                            pickImage = root.uploader::read,
                        )
                    } else {
                        // The session ended (left, removed): drop the chat entry. Popping by route is a no-op when
                        // the router's close request got there first, so Nearby's own entry is never popped.
                        LaunchedEffect(Unit) { nav.popBackStack<ChatRoute>(inclusive = true) }
                    }
                }
            }
            navigation<MarketGraph>(startDestination = MarketHome) {
                composable<MarketHome> {
                    MarketScreen(marketEnabled = market, onOpenListing = { nav.navigate(MarketListing(it)) }, bottomInset = bottomInset)
                }
                composable<MarketListing> {
                    ListingDetailScreen(onBack = { nav.popBackStack() }, onOpenOrder = { router.open(AppTab.Deals, DealsOrder(it)) }, bottomInset = bottomInset)
                }
            }
            navigation<DealsGraph>(startDestination = DealsHome) {
                composable<DealsHome> {
                    DealsScreen(
                        store = root.deals,
                        marketEnabled = market,
                        onOpenOrder = { nav.navigate(DealsOrder(it)) },
                        onOpenListing = { nav.navigate(DealsListing(it)) },
                        bottomInset = bottomInset,
                    )
                }
                composable<DealsOrder> {
                    OrderDetailScreen(onBack = { nav.popBackStack() }, onOpenListing = { nav.navigate(DealsListing(it)) }, bottomInset = bottomInset)
                }
                composable<DealsListing> {
                    ListingDetailScreen(onBack = { nav.popBackStack() }, onOpenOrder = { nav.navigate(DealsOrder(it)) }, bottomInset = bottomInset)
                }
            }
            navigation<ProfileGraph>(startDestination = ProfileHome) {
                composable<ProfileHome> {
                    ProfileScreen(onPayouts = { nav.navigate(ProfilePayouts) }, onMyListings = { nav.navigate(ProfileMyListings) }, bottomInset = bottomInset)
                }
                composable<ProfilePayouts> { Box(Modifier.padding(PaddingValues(bottom = bottomInset))) { PayoutsScreen(onBack = { nav.popBackStack() }) } }
                composable<ProfileMyListings> {
                    MyListingsScreen(
                        onBack = { nav.popBackStack() },
                        onOpenListing = { nav.navigate(ProfileListing(it)) },
                        onGoToMarket = { selectTab(nav, AppTab.Market); router.selectTab(AppTab.Market) },
                        bottomInset = bottomInset,
                    )
                }
                composable<ProfileListing> {
                    ListingDetailScreen(onBack = { nav.popBackStack() }, onOpenOrder = { router.open(AppTab.Deals, DealsOrder(it)) }, bottomInset = bottomInset)
                }
            }
        }
    }
}

private fun selectTab(nav: NavHostController, tab: AppTab) {
    val graph = tabs.first { it.tab == tab }.graph
    nav.navigate(graph) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun handle(nav: NavHostController, request: NavRequest) {
    when (request) {
        NavRequest.ShowChat -> {
            selectTab(nav, AppTab.Nearby)
            nav.navigate(ChatRoute) { launchSingleTop = true }
        }
        NavRequest.CloseChat -> nav.popBackStack<ChatRoute>(inclusive = true)
        is NavRequest.SwitchTab -> selectTab(nav, request.tab)
        is NavRequest.Open -> {
            selectTab(nav, request.tab)
            nav.navigate(request.route) { launchSingleTop = true }
        }
    }
}
