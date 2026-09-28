package com.larea.app.feature.market

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.location.Fix
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Listing
import com.larea.app.core.network.MarketConfig
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.feature.nearby.distanceM
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class MarketMode { Map, List }

data class MarketUiState(
    val listings: List<Listing> = emptyList(),
    val loading: Boolean = false,
    val locating: Boolean = true,
    val error: String? = null,
    val notice: String? = null,
    val filters: MarketFilters = MarketFilters(),
    val mode: MarketMode = MarketMode.Map,
    val selectedId: String? = null,
    val config: MarketConfig = MarketConfig(),
    val fix: Fix? = null,
) {
    val selectedListing: Listing? get() = listings.firstOrNull { it.id == selectedId }
}

/** Listings within reach of the phone's position. The feed is centred on the fix, not on the map. */
@HiltViewModel
class MarketViewModel @Inject constructor(
    private val api: LareaApi,
    private val location: LocationSource,
) : ViewModel() {
    private val _state = MutableStateFlow(MarketUiState())
    val state: StateFlow<MarketUiState> = _state

    private var watch: Job? = null
    private var fixes: Job? = null
    private var queryDebounce: Job? = null
    private var lastRefreshFix: Fix? = null
    private var lastRefreshAt = 0L
    private var filtersDirty = false

    fun start() {
        viewModelScope.launch { apiCall { api.marketConfig() }.onSuccess { config -> _state.update { it.copy(config = config) } } }
        fixes?.cancel()
        fixes = viewModelScope.launch { location.updates.collect { fix -> _state.update { it.copy(fix = fix) } } }
        watch?.cancel()
        watch = viewModelScope.launch {
            while (isActive) {
                val fix = location.latest.value
                if (fix != null && (shouldRefresh(fix) || filtersDirty)) refresh()
                delay(1_000)
            }
        }
    }

    fun stop() {
        watch?.cancel()
        fixes?.cancel()
    }

    private fun shouldRefresh(fix: Fix): Boolean {
        val last = lastRefreshFix ?: return true
        return distanceM(fix.lat, fix.lng, last.lat, last.lng) > 250 || System.currentTimeMillis() - lastRefreshAt > 60_000
    }

    fun setMode(mode: MarketMode) = _state.update { it.copy(mode = mode) }
    fun select(id: String?) = _state.update { it.copy(selectedId = id) }
    fun dismissNotice() = _state.update { it.copy(notice = null) }

    /** Search text waits 300 ms for the typing to settle; other filter changes apply at once. */
    fun setFilters(next: MarketFilters) {
        val current = _state.value.filters
        if (next == current) return
        val onlyQuery = next.copy(query = current.query) == current
        _state.update { it.copy(filters = next) }
        if (onlyQuery) {
            queryDebounce?.cancel()
            queryDebounce = viewModelScope.launch { delay(300); filtersDirty = true }
        } else {
            filtersDirty = true
        }
    }

    suspend fun refresh() {
        val fix = location.latest.value ?: return
        if (_state.value.loading) return
        _state.update { it.copy(loading = true, error = null) }
        val snapshot = _state.value.filters
        val query = mapOf("lat" to fix.lat.toString(), "lng" to fix.lng.toString(), "accuracy" to fix.accuracyM.toString()) + snapshot.queryMap
        apiCall { api.listings(query) }
            .onSuccess { response ->
                _state.update { s ->
                    s.copy(listings = response.listings, selectedId = s.selectedId?.takeIf { id -> response.listings.any { it.id == id } })
                }
                lastRefreshFix = fix
                lastRefreshAt = System.currentTimeMillis()
                if (snapshot == _state.value.filters) filtersDirty = false
            }
            .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        _state.update { it.copy(locating = false, loading = false) }
    }

    fun refreshNow() {
        viewModelScope.launch { refresh() }
    }

    /** A listing just created by the user shows up right away. */
    fun insert(listing: Listing) = _state.update { s -> s.copy(listings = listOf(listing) + s.listings.filterNot { it.id == listing.id }) }

    override fun onCleared() = stop()
}
