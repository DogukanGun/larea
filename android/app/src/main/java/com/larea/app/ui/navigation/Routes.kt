package com.larea.app.ui.navigation

import kotlinx.serialization.Serializable

enum class AppTab { Nearby, Market, Deals, Profile }

// One nested graph per tab. A screen reachable from several tabs has one route class per tab
// so that navigating never jumps into another tab's stack.

@Serializable data object NearbyGraph
@Serializable data object NearbyHome
@Serializable data object ChatRoute
/** A message pin and the chat under it. */
@Serializable data class NearbyPin(val id: String)

@Serializable data object MarketGraph
@Serializable data object MarketHome
@Serializable data class MarketListing(val id: String)

@Serializable data object DealsGraph
@Serializable data object DealsHome
@Serializable data class DealsOrder(val id: String)
@Serializable data class DealsListing(val id: String)

@Serializable data object ProfileGraph
@Serializable data object ProfileHome
@Serializable data object ProfilePayouts
@Serializable data object ProfileMyListings
@Serializable data class ProfileListing(val id: String)

/** Where a listing opens from the tab the user is in. */
fun listingRoute(tab: AppTab, id: String): Any = when (tab) {
    AppTab.Deals -> DealsListing(id)
    AppTab.Profile -> ProfileListing(id)
    else -> MarketListing(id)
}
