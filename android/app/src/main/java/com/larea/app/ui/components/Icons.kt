package com.larea.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsRun
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Chair
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.LocalLibrary
import androidx.compose.material.icons.filled.Park
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.TheaterComedy
import androidx.compose.material.icons.filled.Tram
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.ui.graphics.vector.ImageVector
import com.larea.app.core.network.ListingCategory
import com.larea.app.core.network.VenueCategory

/** Material counterparts of the SF Symbols the iOS app uses for place categories. */
val VenueCategory.icon: ImageVector
    get() = when (this) {
        VenueCategory.LIBRARY -> Icons.Filled.LocalLibrary
        VenueCategory.STATION -> Icons.Filled.Tram
        VenueCategory.SQUARE -> Icons.Filled.AccountBalance
        VenueCategory.UNIVERSITY -> Icons.Filled.School
        VenueCategory.STADIUM -> Icons.Filled.SportsSoccer
        VenueCategory.MUSEUM -> Icons.Filled.TheaterComedy
        VenueCategory.MALL -> Icons.Filled.ShoppingBag
        VenueCategory.PARK -> Icons.Filled.Park
        VenueCategory.CAFE -> Icons.Filled.LocalCafe
        VenueCategory.UNKNOWN -> Icons.Filled.Place
    }

val ListingCategory.icon: ImageVector
    get() = when (this) {
        ListingCategory.FURNITURE -> Icons.Filled.Chair
        ListingCategory.ELECTRONICS -> Icons.Filled.Laptop
        ListingCategory.CLOTHING -> Icons.Filled.Checkroom
        ListingCategory.KIDS -> Icons.Filled.ChildCare
        ListingCategory.HOME -> Icons.Filled.Home
        ListingCategory.SPORTS -> Icons.AutoMirrored.Filled.DirectionsRun
        ListingCategory.BOOKS -> Icons.AutoMirrored.Filled.MenuBook
        ListingCategory.SERVICES -> Icons.Filled.Build
        ListingCategory.HELP -> Icons.Filled.VolunteerActivism
        ListingCategory.OTHER, ListingCategory.UNKNOWN -> Icons.Filled.Inventory2
    }
