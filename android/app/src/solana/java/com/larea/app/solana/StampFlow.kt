package com.larea.app.solana

import android.util.Base64
import com.larea.app.core.location.Fix
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.apiCall
import kotlinx.coroutines.delay
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Check-in: the backend checks the location and prepares a stamp mint (already signed by Larea as
 * tree authority, with the user's wallet paying the fee); the wallet signs; the backend sends it and
 * reports when the stamp is confirmed. A confirmed stamp opens the place's chat for 24 hours.
 */
@Singleton
class StampFlow @Inject constructor(
    private val api: SolanaApi,
    private val adapter: WalletAdapter,
) {
    suspend fun ensureStamp(venueId: String, fix: Fix, step: (String) -> Unit): Result<Unit> = runCatching {
        step("Looking for your stamp…")
        if (apiCall { api.venueStamp(venueId) }.getOrThrow().unlocked) return@runCatching

        step("Checking you in…")
        val checkin = apiCall { api.checkin(venueId, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked)) }.getOrThrow()
        adapter.useCluster(checkin.cluster)

        step("Approve the stamp in your wallet…")
        val signed = adapter.signTransactions(listOf(Base64.decode(checkin.transaction, Base64.NO_WRAP))).single()
        val body = SubmitStampRequest(Base64.encodeToString(signed, Base64.NO_WRAP))

        step("Minting your stamp…")
        var stamp = apiCall { api.submitStamp(checkin.stamp.id, body) }.getOrThrow()
        var waited = 0L
        while (stamp.status == "PENDING" && waited < CONFIRM_TIMEOUT_MS) {
            delay(POLL_MS)
            waited += POLL_MS
            stamp = apiCall { api.submitStamp(checkin.stamp.id, body) }.getOrThrow()
        }
        when (stamp.status) {
            "CONFIRMED" -> step("Stamp collected ✓")
            "FAILED" -> throw WalletException("The stamp could not be minted${stamp.error?.let { " ($it)" } ?: ""}. Please try again.")
            else -> throw WalletException("Your stamp is still being confirmed. Try joining again in a moment.")
        }
    }

    private companion object {
        const val POLL_MS = 1_500L
        const val CONFIRM_TIMEOUT_MS = 45_000L
    }
}
