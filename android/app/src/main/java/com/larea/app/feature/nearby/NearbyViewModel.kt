package com.larea.app.feature.nearby

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.location.Fix
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.NearbyVenue
import com.larea.app.core.network.apiCall
import com.larea.app.feature.auth.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NearbyUiState(
    val locating: Boolean = true,
    val loading: Boolean = false,
    val venues: List<NearbyVenue> = emptyList(),
    val joining: String? = null,
    val error: String? = null,
)

sealed interface NearbyEvent {
    data class Joined(val venueId: String, val venueName: String) : NearbyEvent
    data class Message(val text: String) : NearbyEvent
}

@HiltViewModel
class NearbyViewModel @Inject constructor(
    private val api: LareaApi,
    private val location: LocationSource,
) : ViewModel() {
    private val _state = MutableStateFlow(NearbyUiState())
    val state: StateFlow<NearbyUiState> = _state
    private val _events = MutableSharedFlow<NearbyEvent>(extraBufferCapacity = 4)
    val events: SharedFlow<NearbyEvent> = _events

    @Volatile private var latestFix: Fix? = null
    private var watcher: Job? = null

    fun start() {
        if (watcher?.isActive == true) return
        watcher = viewModelScope.launch {
            location.fixes(10_000L)
                .catch { e -> _state.update { it.copy(locating = false, error = e.message) } }
                .collect { fix ->
                    val first = latestFix == null
                    latestFix = fix
                    if (first) refresh()
                }
        }
    }

    fun stop() {
        watcher?.cancel()
        watcher = null
    }

    fun refresh() {
        val fix = latestFix ?: return
        _state.update { it.copy(loading = true, locating = false, error = null) }
        viewModelScope.launch {
            apiCall { api.nearby(fix.lat, fix.lng, fix.accuracyM) }
                .onSuccess { res -> _state.update { it.copy(loading = false, venues = res.venues) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.userMessage()) } }
        }
    }

    /** The server is the authority: always try to join and show its answer when refused. */
    fun join(venue: NearbyVenue) {
        val fix = latestFix ?: return
        if (_state.value.joining != null) return
        _state.update { it.copy(joining = venue.id) }
        viewModelScope.launch {
            apiCall { api.join(venue.id, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked)) }
                .onSuccess { _events.tryEmit(NearbyEvent.Joined(venue.id, venue.name)) }
                .onFailure { e -> _events.tryEmit(NearbyEvent.Message(e.userMessage())) }
            _state.update { it.copy(joining = null) }
        }
    }
}
