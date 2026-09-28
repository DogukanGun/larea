package com.larea.app.core.browser

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

/** Stripe onboarding and Checkout open in a Custom Tab (the counterpart of SFSafariViewController; no Stripe SDK). */
object InAppBrowser {
    fun open(context: Context, url: String, toolbar: Color) {
        val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(toolbar.toArgb()).build()
        CustomTabsIntent.Builder()
            .setDefaultColorSchemeParams(colors)
            .setShowTitle(true)
            .setUrlBarHidingEnabled(false)
            .build()
            .launchUrl(context, Uri.parse(url))
    }
}
