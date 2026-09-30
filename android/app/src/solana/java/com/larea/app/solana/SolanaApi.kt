package com.larea.app.solana

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST

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

/** The dApp Store build's Solana endpoints (see backend/src/solana). */
interface SolanaApi {
    @POST("solana/wallet/challenge") suspend fun challenge(): SiwsChallenge
    @POST("solana/wallet") suspend fun link(@Body body: LinkWalletRequest): WalletView
    @GET("solana/wallet") suspend fun wallet(): WalletResponse
    @DELETE("solana/wallet") suspend fun unlink()
}
