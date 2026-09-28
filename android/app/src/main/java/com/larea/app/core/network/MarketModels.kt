package com.larea.app.core.network

import com.larea.app.core.format.distanceText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class ListingKind(val raw: String, val label: String) {
    OFFER("OFFER", "Selling"),
    REQUEST("REQUEST", "Looking for help"),
    UNKNOWN("unknown", "Listing");

    companion object {
        fun from(raw: String?): ListingKind = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

enum class ListingCategory(val raw: String, val label: String) {
    FURNITURE("FURNITURE", "Furniture"),
    ELECTRONICS("ELECTRONICS", "Electronics"),
    CLOTHING("CLOTHING", "Clothing"),
    KIDS("KIDS", "Kids"),
    HOME("HOME", "Home"),
    SPORTS("SPORTS", "Sports"),
    BOOKS("BOOKS", "Books"),
    SERVICES("SERVICES", "Services"),
    HELP("HELP", "Help"),
    OTHER("OTHER", "Other"),
    UNKNOWN("unknown", "Other");

    companion object {
        val selectable: List<ListingCategory> get() = entries.filter { it != UNKNOWN }
        fun from(raw: String?): ListingCategory = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

enum class ListingStatus(val raw: String, val label: String) {
    ACTIVE("ACTIVE", "Active"),
    RESERVED("RESERVED", "Reserved"),
    SOLD("SOLD", "Sold"),
    CANCELLED("CANCELLED", "Cancelled"),
    EXPIRED("EXPIRED", "Expired"),
    REMOVED("REMOVED", "Removed"),
    UNKNOWN("unknown", "Listing");

    companion object {
        fun from(raw: String?): ListingStatus = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

@Serializable
data class ListingLocation(val lat: Double, val lng: Double)

@Serializable
data class Listing(
    val id: String,
    @SerialName("kind") val kindRaw: String? = null,
    @SerialName("category") val categoryRaw: String? = null,
    val title: String,
    val description: String = "",
    val priceCents: Int = 0,
    val currency: String = "eur",
    @SerialName("status") val statusRaw: String? = null,
    val owner: Author,
    val mine: Boolean = false,
    val images: List<ImageAttachment> = emptyList(),
    val location: ListingLocation,
    val distanceM: Int? = null,
    val offerCount: Int? = null,
    val createdAt: String = "",
    val expiresAt: String = "",
    /** Detail only: the caller's latest offer. */
    val myOffer: Offer? = null,
    /** Detail only, owner: offers waiting for an answer. */
    val offers: List<Offer>? = null,
    val notice: String? = null,
) {
    val kind: ListingKind get() = ListingKind.from(kindRaw)
    val category: ListingCategory get() = ListingCategory.from(categoryRaw)
    val status: ListingStatus get() = ListingStatus.from(statusRaw)
    val distanceText: String? get() = distanceM?.let(::distanceText)
}

@Serializable
data class ListingsResponse(val listings: List<Listing> = emptyList(), val nextOffset: Int? = null, val radiusM: Double? = null)

enum class OfferStatus(val raw: String, val label: String) {
    PENDING("PENDING", "Pending"),
    ACCEPTED("ACCEPTED", "Accepted"),
    DECLINED("DECLINED", "Declined"),
    WITHDRAWN("WITHDRAWN", "Withdrawn"),
    EXPIRED("EXPIRED", "Expired"),
    UNKNOWN("unknown", "Offer");

    companion object {
        fun from(raw: String?): OfferStatus = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

@Serializable
data class ListingSummary(
    val id: String,
    val title: String,
    @SerialName("kind") val kindRaw: String? = null,
    val priceCents: Int = 0,
    val thumbUrl: String? = null,
    @SerialName("status") val statusRaw: String? = null,
) {
    val kind: ListingKind get() = ListingKind.from(kindRaw)
    val status: ListingStatus get() = ListingStatus.from(statusRaw)
    val thumbnailUrl: String? get() = thumbUrl?.let(MediaUrls::resolve)
}

@Serializable
data class Offer(
    val id: String,
    val listingId: String,
    val listing: ListingSummary,
    val offerer: Author,
    val amountCents: Int = 0,
    val note: String? = null,
    @SerialName("status") val statusRaw: String? = null,
    val expiresAt: String = "",
    val respondedAt: String? = null,
    val orderId: String? = null,
    val createdAt: String = "",
) {
    val status: OfferStatus get() = OfferStatus.from(statusRaw)
}

@Serializable
data class AcceptOfferResponse(val offer: Offer, val order: Order? = null)

@Serializable
data class OfferResponse(val offer: Offer)

@Serializable
data class MarketConfig(
    val enabled: Boolean = true,
    val payments: Boolean = false,
    val testMode: Boolean = false,
    val currency: String = "eur",
    val radiusM: Double = 2000.0,
    val feePercent: Double = 10.0,
    val feeMinCents: Int = 50,
    val minPriceCents: Int = 100,
    val maxPriceCents: Int = 50_000,
    val maxImages: Int = 5,
)

enum class OrderStatus(val raw: String, val label: String) {
    AWAITING_PAYMENT("AWAITING_PAYMENT", "Waiting for payment"),
    PAID("PAID", "Paid"),
    COMPLETED("COMPLETED", "Done"),
    CANCELLED("CANCELLED", "Cancelled"),
    REFUNDED("REFUNDED", "Refunded"),
    DISPUTED("DISPUTED", "Under review"),
    UNKNOWN("unknown", "Deal");

    companion object {
        fun from(raw: String?): OrderStatus = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

@Serializable
data class CheckoutSession(val url: String, val expiresAt: String? = null)

@Serializable
data class Order(
    val id: String,
    val listingId: String = "",
    val listing: ListingSummary,
    val offerId: String = "",
    val payer: Author,
    val payee: Author,
    val role: String = "payer",
    val amountCents: Int = 0,
    val feeCents: Int = 0,
    val payoutCents: Int = amountCents - feeCents,
    val currency: String = "eur",
    @SerialName("status") val statusRaw: String? = null,
    val cancelReason: String? = null,
    val handoverCode: String? = null,
    val paymentDueAt: String = "",
    val paidAt: String? = null,
    val approvalDeadlineAt: String? = null,
    val completedAt: String? = null,
    val cancelledAt: String? = null,
    val refundedAt: String? = null,
    val checkout: CheckoutSession? = null,
    val createdAt: String = "",
) {
    val status: OrderStatus get() = OrderStatus.from(statusRaw)
    val isPayer: Boolean get() = role == "payer"
    val counterpart: Author get() = if (isPayer) payee else payer
}

enum class StripeStatus(val label: String) {
    NOT_SET_UP("Not set up"), PENDING("Almost there"), READY("Ready")
}

@Serializable
data class StripeAccountStatus(
    val connected: Boolean = false,
    val payoutsEnabled: Boolean = false,
    val detailsSubmitted: Boolean = false,
    val requirementsDue: List<String> = emptyList(),
) {
    val status: StripeStatus
        get() = when {
            payoutsEnabled -> StripeStatus.READY
            connected -> StripeStatus.PENDING
            else -> StripeStatus.NOT_SET_UP
        }
}

@Serializable
data class StripeAccountLink(val url: String, val expiresAt: String? = null)

@Serializable
data class ApproveOrderRequest(val code: String)

@Serializable
data class MarketMeResponse(
    val payoutsEnabled: Boolean = false,
    val listings: List<Listing> = emptyList(),
    val offersMade: List<Offer> = emptyList(),
    val offersReceived: List<Offer> = emptyList(),
    val orders: List<Order> = emptyList(),
)

@Serializable
data class CreateListingRequest(
    val kind: String,
    val category: String,
    val title: String,
    val description: String,
    val priceCents: Int,
    val mediaIds: List<String>,
    val lat: Double,
    val lng: Double,
    val accuracy: Double,
    val mocked: Boolean? = null,
)

/** Edits keep the kind and the location; photos are the full list in order (kept ids plus new upload ids). */
@Serializable
data class UpdateListingRequest(
    val title: String,
    val description: String,
    val category: String,
    val priceCents: Int,
    val mediaIds: List<String>,
)

@Serializable
data class CreateOfferRequest(
    val amountCents: Int,
    val note: String? = null,
    val lat: Double,
    val lng: Double,
    val accuracy: Double,
    val mocked: Boolean? = null,
)
