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

/** Adds the bearer token to every request, and tells the backend which store build is calling. */
class AuthInterceptor(private val store: SessionSource, private val build: String? = null) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { store.accessToken() }
        val builder = chain.request().newBuilder()
        if (token != null && chain.request().header(HEADER) == null) builder.header(HEADER, "Bearer $token")
        // The dApp Store build gates chats by check-in stamps; the server only applies that to it.
        if (build != null) builder.header(BUILD_HEADER, build)
        return chain.proceed(builder.build())
    }
}

const val BUILD_HEADER = "X-Larea-Build"

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
