package com.larea.app.core.auth

import android.os.Build
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LoginRequest
import com.larea.app.core.network.MeView
import com.larea.app.core.network.RefreshRequest
import com.larea.app.core.network.RegisterRequest
import com.larea.app.core.network.UpdateMeRequest
import com.larea.app.core.network.apiCall
import kotlinx.coroutines.flow.Flow

class SessionRepository(private val api: LareaApi, private val store: SessionStore) {
    val session: Flow<Session?> = store.session

    private val deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(64)

    suspend fun register(email: String, password: String, displayName: String): Result<MeView> = apiCall {
        val result = api.register(RegisterRequest(email.trim(), password, displayName.trim(), deviceLabel))
        store.save(Session(result.accessToken, result.refreshToken, result.user))
        result.user
    }

    suspend fun login(email: String, password: String): Result<MeView> = apiCall {
        val result = api.login(LoginRequest(email.trim(), password, deviceLabel))
        store.save(Session(result.accessToken, result.refreshToken, result.user))
        result.user
    }

    /** Fetches the profile and caches it; returns the cached one on network failure. */
    suspend fun refreshMe(): Result<MeView> = apiCall {
        val me = api.me()
        store.updateUser(me)
        me
    }

    suspend fun updateDisplayName(displayName: String): Result<MeView> = apiCall {
        val me = api.updateMe(UpdateMeRequest(displayName.trim()))
        store.updateUser(me)
        me
    }

    suspend fun signOut() {
        val refresh = store.current()?.refreshToken
        store.clear()
        if (refresh != null) runCatching { api.logout(RefreshRequest(refresh)) }
    }

    suspend fun deleteAccount(): Result<Unit> = apiCall {
        api.deleteMe()
        store.clear()
    }
}
