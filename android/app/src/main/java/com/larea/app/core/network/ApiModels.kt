package com.larea.app.core.network

import com.larea.app.core.format.Dates
import com.larea.app.core.format.distanceText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Decoding is lenient on purpose (mirrors iOS): missing fields take defaults and enum-like values
// arrive as raw strings, mapped to an `UNKNOWN` case when this build does not know them.

@Serializable
data class ApiError(
    val code: String = "ERROR",
    val message: String = "Something went wrong.",
    val mutedUntil: String? = null,
    val retryAfterSec: Int? = null,
    val suspendedAt: String? = null,
)

@Serializable
data class ActiveMembership(val venueId: String, val venueName: String, val joinedAt: String)

/** What the backend supports; missing on older servers, in which case everything new is off. */
@Serializable
data class Features(
    val images: Boolean = false,
    val polls: Boolean = false,
    val market: Boolean = false,
    val payments: Boolean = false,
    val solana: Boolean = false,
) {
    companion object {
        val None = Features()
    }
}

@Serializable
data class MeView(
    val id: String,
    val email: String,
    val displayName: String,
    val role: String = "USER",
    val ageVerified: Boolean = false,
    val ageVerifiedAt: String? = null,
    val mutedUntil: String? = null,
    val suspendedAt: String? = null,
    val createdAt: String = "",
    val activeMembership: ActiveMembership? = null,
    val features: Features? = null,
    /** The linked Solana wallet (dApp Store build). */
    val walletAddress: String? = null,
) {
    val capabilities: Features get() = features ?: Features.None
}

@Serializable
data class Member(val id: String, val displayName: String)

@Serializable
data class MembersResponse(val members: List<Member> = emptyList(), val count: Int = 0)

@Serializable
data class AuthResult(val accessToken: String, val accessExpiresInSec: Int, val refreshToken: String, val user: MeView)

@Serializable
data class RegisterRequest(val email: String, val password: String, val displayName: String, val deviceLabel: String? = null)

@Serializable
data class LoginRequest(val email: String, val password: String, val deviceLabel: String? = null)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class UpdateMeRequest(val displayName: String)

@Serializable
data class VerificationStatus(
    val verified: Boolean = false,
    val verifiedAt: String? = null,
    val ageThreshold: Int = 18,
    val lastOutcome: String? = null,
    /** Present on the platform endpoint's response: under_age, declined, unknown_age. */
    val reason: String? = null,
)

/** The platform's answer to the age-range question, forwarded to the backend. */
@Serializable
data class PlatformAgeRequest(
    val platform: String,
    val lowerBound: Int? = null,
    val upperBound: Int? = null,
    val declaration: String,
)

enum class VenueCategory(val raw: String, val label: String) {
    LIBRARY("library", "Library"),
    STATION("station", "Station"),
    SQUARE("square", "Square"),
    UNIVERSITY("university", "University"),
    STADIUM("stadium", "Stadium"),
    MUSEUM("museum", "Museum & theatre"),
    MALL("mall", "Shopping"),
    PARK("park", "Park"),
    CAFE("cafe", "Café"),
    UNKNOWN("unknown", "Place");

    companion object {
        fun from(raw: String?): VenueCategory = entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

@Serializable
data class NearbyVenue(
    val id: String,
    val slug: String,
    val name: String,
    val label: String,
    @SerialName("category") val categoryRaw: String? = null,
    val address: String? = null,
    val lat: Double,
    val lng: Double,
    val distanceM: Int = 0,
    val eligible: Boolean,
    val memberCount: Int,
) {
    val category: VenueCategory get() = VenueCategory.from(categoryRaw)

    /** "80 m" / "1.2 km" */
    val distanceText: String get() = distanceText(distanceM)
}

@Serializable
data class NearbyResponse(
    val venues: List<NearbyVenue> = emptyList(),
    /** Places for this area are still being discovered; poll again shortly. */
    val pending: Boolean = false,
    val degraded: Boolean = false,
    val attribution: String? = null,
)

@Serializable
data class LocationFixBody(val lat: Double, val lng: Double, val accuracy: Double, val mocked: Boolean? = null)

@Serializable
data class VenueView(
    val id: String,
    val slug: String,
    val name: String,
    val label: String,
    @SerialName("category") val categoryRaw: String? = null,
    val address: String? = null,
) {
    val category: VenueCategory get() = VenueCategory.from(categoryRaw)
}

@Serializable
data class MembershipInfo(val id: String, val venueId: String, val joinedAt: String)

@Serializable
data class Timing(val heartbeatIntervalSec: Int = 25, val staleAfterSec: Int = 120, val weakGpsGraceSec: Int = 300)

@Serializable
data class JoinResult(val membership: MembershipInfo, val venue: VenueView, val timing: Timing = Timing(), val memberCount: Int = 0)

@Serializable
data class Author(val id: String, val displayName: String)

enum class MessageKind(val raw: String) {
    TEXT("TEXT"), IMAGE("IMAGE"), POLL("POLL"), UNKNOWN("unknown");

    companion object {
        fun from(raw: String?): MessageKind = if (raw == null) TEXT else entries.firstOrNull { it.raw == raw } ?: UNKNOWN
    }
}

/** A served photo: the upload response and the `image` of a chat message share this shape. */
@Serializable
data class ImageAttachment(
    val id: String? = null,
    val url: String,
    val thumbUrl: String? = null,
    val width: Int = 0,
    val height: Int = 0,
) {
    val key: String get() = id ?: url
    val aspectRatio: Float get() = if (height > 0) width.toFloat() / height else 1f
    val fullUrl: String get() = MediaUrls.resolve(url)
    val thumbnailUrl: String get() = MediaUrls.resolve(thumbUrl ?: url)
}

@Serializable
data class PollOptionView(val id: String, val text: String, val votes: Int = 0)

@Serializable
data class PollView(
    val id: String,
    val question: String,
    val options: List<PollOptionView> = emptyList(),
    val totalVotes: Int = options.sumOf { it.votes },
    /** The viewer's choice; only REST responses carry it, fan-out updates keep the local one. */
    val myOptionId: String? = null,
    val closed: Boolean = false,
    val closesAt: String? = null,
) {
    fun isClosed(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (closed) return true
        val closes = Dates.parseMillis(closesAt) ?: return false
        return closes <= nowMs
    }

    fun percent(option: PollOptionView): Int =
        if (totalVotes > 0) Math.round(option.votes.toDouble() / totalVotes * 100).toInt() else 0

    /** Fresh counts from the room, keeping what only we know (our own vote). */
    fun merging(update: PollView): PollView = update.copy(myOptionId = update.myOptionId ?: myOptionId)
}

@Serializable
data class ChatMessage(
    val id: String,
    val venueId: String,
    val author: Author,
    /** Always readable: the message, or a fallback for kinds this build does not render. */
    val text: String = "",
    val status: String = "APPROVED",
    val createdAt: String,
    @SerialName("kind") val kindRaw: String? = null,
    val caption: String? = null,
    val image: ImageAttachment? = null,
    val poll: PollView? = null,
    /** The author's loyalty level at this place (Solana build); 0 = none. */
    val authorLevel: Int = 0,
    /** "REGULARS" for the Regulars room; null = the main chat. */
    val room: String? = null,
) {
    val kind: MessageKind get() = MessageKind.from(kindRaw)
}

@Serializable
data class CreatePollRequest(val question: String, val options: List<String>, val durationMinutes: Int? = null, val clientKey: String)

@Serializable
data class VoteRequest(val optionId: String)

@Serializable
data class PollResponse(val poll: PollView)

@Serializable
data class SendMessageRequest(
    val kind: String? = null,
    val text: String? = null,
    val mediaId: String? = null,
    val clientKey: String,
    /** "REGULARS" to post in the Regulars room; null = the main chat. */
    val room: String? = null,
) {
    companion object {
        fun text(text: String, clientKey: String, room: String? = null) = SendMessageRequest(text = text, clientKey = clientKey, room = room)

        fun image(mediaId: String, caption: String?, clientKey: String, room: String? = null) =
            SendMessageRequest(kind = "IMAGE", text = caption?.takeIf { it.isNotEmpty() }, mediaId = mediaId, clientKey = clientKey, room = room)
    }
}

@Serializable
data class SendResult(val status: String, val message: ChatMessage? = null, val notice: String? = null)

@Serializable
data class HistoryResponse(val messages: List<ChatMessage> = emptyList())

@Serializable
data class CreateReportRequest(val reason: String, val details: String? = null)

@Serializable
data class BlockedUser(val id: String, val displayName: String, val blockedAt: String = "")

@Serializable
data class BlocksResponse(val blocks: List<BlockedUser> = emptyList())
