package com.larea.app.feature.nearby

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.location.Fix
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.NearbyVenue
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.solana.SolanaUi
import com.larea.app.ui.map.MapViewport
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/** Wider than this the server only returns landmarks; cafés need a closer look. */
const val CAFE_RADIUS_M = 1500.0
const val MIN_VIEW_RADIUS_M = 300.0
const val MAX_VIEW_RADIUS_M = 12_000.0

data class NearbyUiState(
    val venues: List<NearbyVenue> = emptyList(),
    val loading: Boolean = false,
    val locating: Boolean = true,
    val joining: String? = null,
    /** What joining is doing right now (the Solana build checks in through the wallet first). */
    val joiningStep: String? = null,
    /** The Solana build: joining starts with a check-in stamp. */
    val stamps: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val degraded: Boolean = false,
    /** The server is still discovering places for this area. */
    val discovering: Boolean = false,
    val attribution: String = "Place data © OpenStreetMap contributors",
    val selectedId: String? = null,
    val viewport: MapViewport? = null,
    val fix: Fix? = null,
) {
    val selectedVenue: NearbyVenue? get() = venues.firstOrNull { it.id == selectedId }

    /** True once the map has been panned away from the user's own surroundings. */
    val viewingElsewhere: Boolean
        get() {
            val view = viewport ?: return false
            val here = fix ?: return false
            return distanceM(view.lat, view.lng, here.lat, here.lng) > max(1000.0, view.radiusM)
        }

    /** Wide view: only landmarks are shown, cafés appear after zooming in. */
    val zoomedOut: Boolean get() = (viewport?.radiusM ?: 0.0) > CAFE_RADIUS_M
}

/** Haversine distance in metres. */
fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLng = Math.toRadians(lng2 - lng1)
    val a = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * 6_371_000.0 * asin(sqrt(a))
}

/** Places around the user and wherever the map is looking; the server decides who may join. */
@HiltViewModel
class NearbyViewModel @Inject constructor(
    private val api: LareaApi,
    private val location: LocationSource,
    private val solana: SolanaUi,
) : ViewModel() {
    private val _state = MutableStateFlow(NearbyUiState(stamps = solana.enabled))
    val state: StateFlow<NearbyUiState> = _state

    private var watch: Job? = null
    private var fixes: Job? = null
    private var lastRefreshFix: Fix? = null
    private var lastRefreshViewport: MapViewport? = null
    private var lastRefreshAt = 0L
    private var pendingPolls = 0

    fun start() {
        fixes?.cancel()
        fixes = viewModelScope.launch { location.updates.collect { fix -> _state.update { it.copy(fix = fix) } } }
        watch?.cancel()
        watch = viewModelScope.launch {
            while (isActive) {
                val fix = location.latest.value
                val s = _state.value
                if (fix != null && (shouldRefresh(fix) || viewportMoved())) {
                    pendingPolls = 0
                    refresh()
                } else if (s.discovering && pendingPolls < 40 && System.currentTimeMillis() - lastRefreshAt >= 3_000) {
                    // Discovery runs on the server; poll until the area is covered.
                    pendingPolls++
                    refresh()
                }
                delay(1_000)
            }
        }
    }

    fun stop() {
        watch?.cancel()
        fixes?.cancel()
        watch = null
        fixes = null
    }

    /** The map settled on a new camera position: fetch the places there. */
    fun mapMoved(viewport: MapViewport) {
        _state.update { it.copy(viewport = viewport.copy(radiusM = viewport.radiusM.coerceIn(MIN_VIEW_RADIUS_M, MAX_VIEW_RADIUS_M))) }
        if (!viewportMoved() || _state.value.loading) return
        pendingPolls = 0
        viewModelScope.launch { refresh() }
    }

    fun select(id: String?) = _state.update { it.copy(selectedId = id) }

    fun dismissNotice() = _state.update { it.copy(notice = null) }

    /** The map moved by more than a third of its half-width, or zoomed by more than a third. */
    private fun viewportMoved(): Boolean {
        val view = _state.value.viewport ?: return false
        val last = lastRefreshViewport ?: return true
        return distanceM(view.lat, view.lng, last.lat, last.lng) > last.radiusM / 3 || abs(view.radiusM - last.radiusM) > last.radiusM / 3
    }

    /** Refresh when we move more than 250 m or every 60 s. */
    private fun shouldRefresh(fix: Fix): Boolean {
        val last = lastRefreshFix ?: return true
        return distanceM(fix.lat, fix.lng, last.lat, last.lng) > 250 || System.currentTimeMillis() - lastRefreshAt > 60_000
    }

    suspend fun refresh() {
        val fix = location.latest.value ?: return
        if (_state.value.loading) return
        _state.update { it.copy(loading = true, error = null) }
        val view = _state.value.viewport
        apiCall { api.nearby(fix.lat, fix.lng, fix.accuracyM, view?.lat, view?.lng, view?.radiusM?.let { Math.round(it).toInt() }) }
            .onSuccess { response ->
                _state.update { s ->
                    s.copy(
                        venues = response.venues,
                        discovering = response.pending,
                        degraded = response.degraded,
                        attribution = response.attribution ?: s.attribution,
                        selectedId = s.selectedId?.takeIf { id -> response.venues.any { it.id == id } },
                    )
                }
                lastRefreshFix = fix
                lastRefreshViewport = view
                lastRefreshAt = System.currentTimeMillis()
            }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        _state.update { it.copy(locating = false, loading = false) }
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    /** The server decides; a refusal comes back with its own message ("You need to be closer…"). */
    suspend fun join(venueId: String): Boolean {
        val fix = location.latest.value ?: location.awaitFix() ?: return false
        if (_state.value.joining != null) return false
        _state.update { it.copy(joining = venueId) }
        val result = solana.beforeJoin(venueId, fix) { step -> _state.update { it.copy(joiningStep = step) } }
            .mapCatching { apiCall { api.join(venueId, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked)) }.getOrThrow() }
        _state.update { it.copy(joining = null, joiningStep = null, notice = result.exceptionOrNull()?.userMessage()) }
        return result.isSuccess
    }

    override fun onCleared() {
        stop()
    }
}
