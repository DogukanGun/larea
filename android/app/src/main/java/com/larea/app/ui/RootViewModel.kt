package com.larea.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.location.LocationPermission
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.MeView
import com.larea.app.core.media.ImageUploader
import com.larea.app.core.realtime.RealtimeClient
import com.larea.app.feature.chat.ChatSessionFactory
import com.larea.app.feature.deals.DealsStore
import com.larea.app.ui.navigation.AppRouter
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Where the user is in the onboarding funnel. Drives the root gate (same order as iOS `RootView`). */
sealed interface AppState {
    data object Loading : AppState
    data object SignedOut : AppState
    data object NeedsVerification : AppState
    data class NeedsLocation(val permission: LocationPermission) : AppState
    data object Suspended : AppState
    data object Ready : AppState
}

@HiltViewModel
class RootViewModel @Inject constructor(
    private val sessions: SessionRepository,
    private val location: LocationSource,
    private val realtime: RealtimeClient,
    val router: AppRouter,
    val chats: ChatSessionFactory,
    val uploader: ImageUploader,
    val deals: DealsStore,
) : ViewModel() {
    private val permission = MutableStateFlow(location.permission())

    val me: StateFlow<MeView?> = sessions.session.map { it?.user }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val state: StateFlow<AppState> = combine(sessions.session, permission) { session, perm ->
        val me = session?.user ?: return@combine AppState.SignedOut
        when {
            me.suspendedAt != null -> AppState.Suspended
            !me.ageVerified -> AppState.NeedsVerification
            perm != LocationPermission.Precise -> AppState.NeedsLocation(perm)
            else -> AppState.Ready
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, AppState.Loading)

    /** Re-check the permission (e.g. after returning from system settings). */
    fun refreshPermission() {
        permission.value = location.permission()
    }

    /** Pull the latest profile (verification, mute, suspension may have changed). */
    fun refreshMe() {
        viewModelScope.launch { sessions.refreshMe() }
    }

    fun signOut() {
        viewModelScope.launch { sessions.signOut() }
    }

    /** The main tabs appeared: the socket lives as long as they do. */
    fun mainShown() {
        realtime.connect()
        router.mainShown()
    }

    fun mainHidden() {
        deals.stop()
        router.reset()
        realtime.disconnect()
    }
}
