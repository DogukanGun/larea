package com.larea.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.location.LocationPermission
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.MeView
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Where the user is in the onboarding funnel. Drives the root navigation gate. */
sealed interface AppState {
    data object Loading : AppState
    data object SignedOut : AppState
    data class NeedsVerification(val me: MeView) : AppState
    data class NeedsLocation(val me: MeView, val permission: LocationPermission) : AppState
    data class Suspended(val me: MeView) : AppState
    data class Ready(val me: MeView) : AppState
}

@HiltViewModel
class RootViewModel @Inject constructor(
    private val sessions: SessionRepository,
    private val location: LocationSource,
) : ViewModel() {
    private val permission = MutableStateFlow(location.permission())

    val state: StateFlow<AppState> = combine(sessions.session, permission) { session, perm ->
        val me = session?.user ?: return@combine AppState.SignedOut
        when {
            me.suspendedAt != null -> AppState.Suspended(me)
            !me.ageVerified -> AppState.NeedsVerification(me)
            perm != LocationPermission.Precise -> AppState.NeedsLocation(me, perm)
            else -> AppState.Ready(me)
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, AppState.Loading)

    /** Re-check the permission (e.g. after returning from system settings). */
    fun refreshPermission() {
        permission.value = location.permission()
    }

    /** Pull the latest profile from the backend (verification, mute, suspension may have changed). */
    fun refreshMe() {
        viewModelScope.launch { sessions.refreshMe() }
    }
}
