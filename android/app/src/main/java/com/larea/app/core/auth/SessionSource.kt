package com.larea.app.core.auth

/** Read access to the current access token (implemented by SessionStore; faked in tests). */
interface SessionSource {
    suspend fun accessToken(): String?
}

/** Exchanges a stale access token for a fresh one; null means the session is gone. */
interface TokenRefreshing {
    suspend fun refresh(staleAccessToken: String?): String?
}
