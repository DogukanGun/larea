package com.larea.app.core.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.larea.app.core.network.MeView
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

data class Session(val accessToken: String, val refreshToken: String, val user: MeView)

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "session")

/** Persists the signed-in session. The refresh token is encrypted with a Keystore key. */
class SessionStore(private val context: Context, private val json: Json, private val cipher: KeystoreCipher = KeystoreCipher()) : SessionSource {
    private val accessKey = stringPreferencesKey("access_token")
    private val refreshKey = stringPreferencesKey("refresh_token_enc")
    private val userKey = stringPreferencesKey("user_json")

    val session: Flow<Session?> = context.sessionDataStore.data.map { prefs -> prefs.toSession() }

    suspend fun current(): Session? = context.sessionDataStore.data.first().toSession()

    override suspend fun accessToken(): String? = current()?.accessToken

    suspend fun save(session: Session) {
        context.sessionDataStore.edit { prefs ->
            prefs[accessKey] = session.accessToken
            prefs[refreshKey] = cipher.encrypt(session.refreshToken)
            prefs[userKey] = json.encodeToString(MeView.serializer(), session.user)
        }
    }

    suspend fun updateAccessToken(accessToken: String) {
        context.sessionDataStore.edit { prefs -> prefs[accessKey] = accessToken }
    }

    suspend fun updateUser(user: MeView) {
        context.sessionDataStore.edit { prefs -> prefs[userKey] = json.encodeToString(MeView.serializer(), user) }
    }

    suspend fun clear() {
        context.sessionDataStore.edit { it.clear() }
    }

    private fun Preferences.toSession(): Session? {
        val access = this[accessKey] ?: return null
        val refresh = this[refreshKey]?.let(cipher::decrypt) ?: return null
        val user = this[userKey]?.let { runCatching { json.decodeFromString(MeView.serializer(), it) }.getOrNull() } ?: return null
        return Session(access, refresh, user)
    }
}
