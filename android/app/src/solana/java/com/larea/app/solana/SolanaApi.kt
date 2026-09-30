package com.larea.app.solana

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import com.larea.app.core.network.LocationFixBody

@Serializable
data class SiwsChallenge(
    val domain: String,
    val statement: String,
    val uri: String,
    val version: String = "1",
    val chainId: String,
    val nonce: String,
    val issuedAt: String,
)

@Serializable
data class LinkWalletRequest(val address: String, val message: String, val signature: String)

@Serializable
data class WalletView(val address: String, val linkedAt: String = "", val cluster: String = "devnet")

@Serializable
data class WalletBalances(val sol: Double = 0.0, val usdc: Double = 0.0, val skr: Double = 0.0)

@Serializable
data class WalletResponse(val wallet: WalletView? = null, val balances: WalletBalances? = null)

@Serializable
data class StampView(
    val id: String,
    val venueId: String,
    val venueName: String = "",
    val day: String = "",
    val visit: Int = 1,
    /** PENDING, CONFIRMED or FAILED. */
    val status: String = "PENDING",
    val signature: String? = null,
    val assetId: String? = null,
    val error: String? = null,
    val confirmedAt: String? = null,
    /** The level badge minted with this stamp, if the visit reached one. */
    val levelMinted: Int? = null,
    val unlocksUntil: String? = null,
    /** Whether the DAS index shows it in the wallet; null when the server has no DAS RPC. */
    val onChain: Boolean? = null,
)

@Serializable
data class CheckinResult(val stamp: StampView, val transaction: String, val cluster: String = "devnet")

@Serializable
data class LoyaltyView(
    val venueId: String,
    val venueName: String = "",
    val stamps: Int = 0,
    val level: Int = 0,
    val levelName: String = "None",
    /** Stamps needed for the next level; null at Legend. */
    val nextLevelAt: Int? = null,
)

@Serializable
data class LevelsResponse(val levels: List<LoyaltyView> = emptyList(), val thresholds: List<Int> = listOf(5, 15, 40))

@Serializable
data class VenueStampStatus(
    val unlocked: Boolean = false,
    val unlocksUntil: String? = null,
    val checkedInToday: Boolean = false,
    val visits: Int = 0,
    val pending: StampView? = null,
    val loyalty: LoyaltyView? = null,
)

@Serializable
data class SubmitStampRequest(val signedTransaction: String)

@Serializable
data class StampsResponse(val stamps: List<StampView> = emptyList(), val dasChecked: Boolean = false)

@Serializable
data class CreateTipRequest(val toUserId: String, val token: String, val amount: String)

@Serializable
data class TipView(
    val id: String,
    val token: String,
    val amount: String,
    /** PENDING, CONFIRMED or FAILED. */
    val status: String = "PENDING",
    val signature: String? = null,
    val error: String? = null,
)

@Serializable
data class TipResult(val tip: TipView, val transaction: String, val cluster: String = "devnet")

/** The dApp Store build's Solana endpoints (see backend/src/solana). */
interface SolanaApi {
    @POST("solana/wallet/challenge") suspend fun challenge(): SiwsChallenge
    @POST("solana/wallet") suspend fun link(@Body body: LinkWalletRequest): WalletView
    @GET("solana/wallet") suspend fun wallet(): WalletResponse
    @DELETE("solana/wallet") suspend fun unlink()

    @GET("venues/{id}/stamp") suspend fun venueStamp(@Path("id") venueId: String): VenueStampStatus
    @POST("venues/{id}/checkin") suspend fun checkin(@Path("id") venueId: String, @Body fix: LocationFixBody): CheckinResult
    @POST("solana/stamps/{id}/submit") suspend fun submitStamp(@Path("id") stampId: String, @Body body: SubmitStampRequest): StampView
    @GET("solana/stamps") suspend fun stamps(): StampsResponse
    @GET("solana/levels") suspend fun levels(): LevelsResponse

    @POST("venues/{id}/tips") suspend fun tip(@Path("id") venueId: String, @Body body: CreateTipRequest): TipResult
    @POST("solana/tips/{id}/submit") suspend fun submitTip(@Path("id") tipId: String, @Body body: SubmitStampRequest): TipView
}
