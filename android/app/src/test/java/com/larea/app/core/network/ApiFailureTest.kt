package com.larea.app.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class ApiFailureTest {
    private fun http(status: Int, body: String) =
        HttpException(Response.error<Any>(status, body.toResponseBody("application/json".toMediaType())))

    @Test
    fun `maps a structured backend error`() {
        val failure = http(403, """{"code":"MUTED","message":"You can't send messages right now.","mutedUntil":"2026-09-07T00:00:00.000Z"}""").toApiFailure()
        val api = failure as ApiException
        assertEquals("MUTED", api.code)
        assertEquals("You can't send messages right now.", api.message)
        assertEquals(403, api.status)
        assertEquals("2026-09-07T00:00:00.000Z", api.mutedUntil)
    }

    @Test
    fun `falls back to a generic message when the body is not JSON`() {
        val api = http(502, "<html>bad gateway</html>").toApiFailure() as ApiException
        assertEquals("HTTP_502", api.code)
        assertEquals(502, api.status)
    }

    @Test
    fun `wraps transport failures`() {
        assertTrue(IOException("boom").toApiFailure() is NetworkException)
    }
}
