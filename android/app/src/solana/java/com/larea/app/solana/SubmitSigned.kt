package com.larea.app.solana

import com.larea.app.core.network.NetworkException
import com.larea.app.core.network.apiCall
import kotlinx.coroutines.delay

/**
 * Sends a transaction the wallet just signed to the backend, retrying network failures for a while.
 *
 * The wallet answers while it is still on screen, so Larea is in the background at that moment, and
 * Android blocks a background app's network (even DNS lookups) until it comes back to the front.
 * A single attempt then fails with "Can't reach Larea" although nothing is wrong. The backend's
 * submit endpoints are idempotent (the same signed transaction is recorded once), so repeating is
 * safe; the signed transaction stays valid for about a minute.
 */
suspend fun <T> submitSigned(
    timeoutMs: Long = SUBMIT_RETRY_TIMEOUT_MS,
    stepMs: Long = SUBMIT_RETRY_STEP_MS,
    block: suspend () -> T,
): T {
    var waited = 0L
    while (true) {
        val result = apiCall(block)
        val error = result.exceptionOrNull() ?: return result.getOrThrow()
        if (error !is NetworkException || waited >= timeoutMs) throw error
        delay(stepMs)
        waited += stepMs
    }
}

const val SUBMIT_RETRY_TIMEOUT_MS = 30_000L
const val SUBMIT_RETRY_STEP_MS = 1_000L
