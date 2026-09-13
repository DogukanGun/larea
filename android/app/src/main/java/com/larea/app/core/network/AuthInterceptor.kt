package com.larea.app.core.network

import com.larea.app.core.auth.SessionSource
import com.larea.app.core.auth.TokenRefreshing
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

private const val HEADER = "Authorization"

/** Adds the bearer token to every request. */
class AuthInterceptor(private val store: SessionSource) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { store.accessToken() }
        val request = if (token != null && chain.request().header(HEADER) == null) {
            chain.request().newBuilder().header(HEADER, "Bearer $token").build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}

/** On 401, refreshes once and retries the request with the new token. */
class TokenAuthenticator(private val refresher: TokenRefreshing) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.contains("/auth/")) return null
        if (responseCount(response) >= 2) return null
        val stale = response.request.header(HEADER)?.removePrefix("Bearer ")
        val fresh = runBlocking { refresher.refresh(stale) } ?: return null
        return response.request.newBuilder().header(HEADER, "Bearer $fresh").build()
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
