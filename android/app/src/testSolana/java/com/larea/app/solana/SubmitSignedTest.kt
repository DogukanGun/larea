package com.larea.app.solana

import com.larea.app.core.network.ApiException
import com.larea.app.core.network.NetworkException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.net.UnknownHostException

/** Submitting a wallet-signed transaction survives the moments Larea is still in the background. */
class SubmitSignedTest {
    @Test
    fun `retries network failures until the app can reach the backend`() = runTest {
        var calls = 0
        val result = submitSigned {
            calls++
            if (calls < 4) throw UnknownHostException("Unable to resolve host")
            "confirmed"
        }
        assertEquals("confirmed", result)
        assertEquals(4, calls)
    }

    @Test
    fun `gives up after the timeout with the network error`() = runTest {
        var calls = 0
        try {
            submitSigned(timeoutMs = 3_000, stepMs = 1_000) { calls++; throw UnknownHostException("offline") }
            fail("expected a network error")
        } catch (e: NetworkException) {
            assertTrue(e.cause is UnknownHostException)
        }
        assertEquals(4, calls)
    }

    @Test
    fun `does not retry answers from the backend`() = runTest {
        var calls = 0
        try {
            submitSigned { calls++; throw ApiException(code = "CHECKIN_EXPIRED", message = "This check-in expired.", status = 400) }
            fail("expected the backend error")
        } catch (e: ApiException) {
            assertEquals("CHECKIN_EXPIRED", e.code)
        }
        assertEquals(1, calls)
    }
}
