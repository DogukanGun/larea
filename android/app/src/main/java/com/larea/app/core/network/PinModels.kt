package com.larea.app.core.network

import com.larea.app.core.format.Dates
import kotlinx.serialization.Serializable
import java.util.Locale

/** How far a pin is from where its buyer stood: decides the price and how long it stays up. */
enum class PinTier(val raw: String, val title: String) {
    NEARBY("NEARBY", "Near you"),
    CITY("CITY", "In your city"),
    COUNTRY("COUNTRY", "In your country"),
    WORLD("WORLD", "Abroad");

    val productId: String get() = "com.dogukangundogan.larea.pin.${raw.lowercase(Locale.ROOT)}"

    companion object {
        fun from(raw: String?): PinTier = entries.firstOrNull { it.raw == raw } ?: WORLD
    }
}

/** A message pinned to a spot on the map, with a chat under it run by whoever paid for it. */
@Serializable
data class MessagePin(
    val id: String,
    val text: String,
    val tier: String,
    val status: String,
    val lat: Double,
    val lng: Double,
    val owner: Author,
    val mine: Boolean = false,
    val createdAt: String = "",
    val expiresAt: String? = null,
    val editedAt: String? = null,
    val messageCount: Int = 0,
    val distanceM: Int? = null,
    val eligible: Boolean? = null,
) {
    val pinTier: PinTier get() = PinTier.from(tier)
    val isLive: Boolean get() = status == "ACTIVE" && Dates.isFuture(expiresAt)

    /** The owner can always chat; everyone else needs to be close. */
    val canChat: Boolean get() = mine || eligible == true

    val distanceText: String?
        get() = distanceM?.let { if (it < 1000) "$it m" else String.format(Locale.US, "%.1f km", it / 1000.0) }
}

@Serializable
data class PinsResponse(val pins: List<MessagePin> = emptyList())

@Serializable
data class PinQuote(
    val pin: MessagePin,
    val tier: String,
    val productId: String,
    val priceUsd: String,
    val durationHours: Int,
    val buyerCity: String? = null,
    val targetCity: String? = null,
    val notice: String? = null,
) {
    val pinTier: PinTier get() = PinTier.from(tier)
    val durationText: String get() = if (durationHours < 48) "$durationHours hours" else "${durationHours / 24} days"
}

@Serializable
data class PinQuoteRequest(val lat: Double, val lng: Double, val text: String, val fix: LocationFixBody)

/** apple: signedTransaction; google: productId + purchaseToken. */
@Serializable
data class PinPurchaseRequest(
    val platform: String,
    val productId: String? = null,
    val purchaseToken: String? = null,
    val signedTransaction: String? = null,
)

@Serializable
data class PinTextRequest(val text: String)

@Serializable
data class PinMessage(
    val id: String,
    val pinId: String,
    val author: Author,
    val text: String,
    val status: String = "APPROVED",
    val createdAt: String = "",
)

@Serializable
data class PinMessagesResponse(val messages: List<PinMessage> = emptyList())

@Serializable
data class SendPinMessageRequest(val text: String, val clientKey: String, val fix: LocationFixBody? = null)

@Serializable
data class PinSendResult(val status: String, val message: PinMessage? = null, val notice: String? = null)

@Serializable
data class BanUserRequest(val userId: String)
