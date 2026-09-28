package com.larea.app.ui.navigation

import java.net.URI

/**
 * Links the backend redirects into: `larea://market/order/<id>?checkout=success|cancel`
 * and `larea://market/stripe/return`.
 */
sealed interface DeepLink {
    data class OrderCheckout(val orderId: String, val success: Boolean) : DeepLink
    data object StripeReturn : DeepLink

    companion object {
        fun parse(raw: String?): DeepLink? {
            val uri = runCatching { URI(raw ?: return null) }.getOrNull() ?: return null
            if (uri.scheme?.lowercase() != "larea" || uri.host?.lowercase() != "market") return null
            val parts = uri.path.orEmpty().split('/').filter { it.isNotEmpty() }
            if (parts == listOf("stripe", "return")) return StripeReturn
            if (parts.size == 2 && parts[0] == "order" && parts[1].isNotEmpty()) {
                val query = uri.rawQuery.orEmpty().split('&').mapNotNull { pair ->
                    pair.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] }
                }.toMap()
                return OrderCheckout(parts[1], (query["checkout"] ?: "success") == "success")
            }
            return null
        }
    }
}
