package com.larea.app.core.auth

import com.larea.app.core.network.AuthResult
import com.larea.app.core.network.RefreshRequest
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Exchanges the refresh token for a new access token. Single-flight: concurrent callers
 * that saw the same stale access token share one refresh; a permanent failure signs out.
 */
class TokenRefresher(
    private val plainClient: OkHttpClient,
    private val baseUrl: String,
    private val json: Json,
    private val store: SessionStore,
) : TokenRefreshing {
    private val mutex = Mutex()

    /** Returns the current valid access token, refreshing if `staleAccessToken` is still the stored one. */
    override suspend fun refresh(staleAccessToken: String?): String? = mutex.withLock {
        val session = store.current() ?: return null
        if (staleAccessToken != null && session.accessToken != staleAccessToken) return session.accessToken

        val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(session.refreshToken))
            .toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url("${baseUrl}auth/refresh").post(body).build()
        val response = runCatching { plainClient.newCall(request).execute() }.getOrElse { return session.accessToken }
        response.use {
            if (it.code == 401) {
                store.clear()
                return null
            }
            if (!it.isSuccessful) return session.accessToken // transient; keep the old token
            val result = json.decodeFromString(AuthResult.serializer(), it.body.string())
            store.save(Session(result.accessToken, result.refreshToken, result.user))
            return result.accessToken
        }
    }
}
