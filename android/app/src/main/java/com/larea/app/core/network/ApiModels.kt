package com.larea.app.core.network

import kotlinx.serialization.Serializable

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

@Serializable
data class MeView(
    val id: String,
    val email: String,
    val displayName: String,
    val role: String,
    val ageVerified: Boolean,
    val ageVerifiedAt: String? = null,
    val mutedUntil: String? = null,
    val suspendedAt: String? = null,
    val createdAt: String,
    val activeMembership: ActiveMembership? = null,
)

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
data class StartedSession(val sessionId: String, val provider: String, val launchUrl: String)

@Serializable
data class VerificationStatus(
    val verified: Boolean,
    val verifiedAt: String? = null,
    val pending: Boolean,
    val lastOutcome: String? = null,
    val retryAfterSec: Int? = null,
    val ageThreshold: Int = 18,
)

@Serializable
data class NearbyVenue(
    val id: String,
    val slug: String,
    val name: String,
    val label: String,
    val eligible: Boolean,
    val memberCount: Int,
)

@Serializable
data class NearbyResponse(val venues: List<NearbyVenue>)

@Serializable
data class LocationFixBody(val lat: Double, val lng: Double, val accuracy: Double, val mocked: Boolean? = null)

@Serializable
data class VenueView(val id: String, val slug: String, val name: String, val label: String)

@Serializable
data class MembershipInfo(val id: String, val venueId: String, val joinedAt: String)

@Serializable
data class Timing(val heartbeatIntervalSec: Int = 25, val staleAfterSec: Int = 120, val weakGpsGraceSec: Int = 300)

@Serializable
data class JoinResult(val membership: MembershipInfo, val venue: VenueView, val timing: Timing, val memberCount: Int)

@Serializable
data class Author(val id: String, val displayName: String)

@Serializable
data class ChatMessage(
    val id: String,
    val venueId: String,
    val author: Author,
    val text: String,
    val status: String,
    val createdAt: String,
)

@Serializable
data class SendMessageRequest(val text: String, val clientKey: String)

@Serializable
data class SendResult(val status: String, val message: ChatMessage? = null, val notice: String? = null)

@Serializable
data class HistoryResponse(val messages: List<ChatMessage>)

@Serializable
data class CreateReportRequest(val reason: String, val details: String? = null)

@Serializable
data class BlockedUser(val id: String, val displayName: String, val blockedAt: String)

@Serializable
data class BlocksResponse(val blocks: List<BlockedUser>)
