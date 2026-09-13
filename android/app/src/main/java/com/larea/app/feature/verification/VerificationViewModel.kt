package com.larea.app.feature.verification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.VerificationStatus
import com.larea.app.core.network.apiCall
import com.larea.app.feature.auth.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VerificationUiState(
    val busy: Boolean = false,
    val launchUrl: String? = null,
    val status: VerificationStatus? = null,
    val error: String? = null,
)

@HiltViewModel
class VerificationViewModel @Inject constructor(
    private val api: LareaApi,
    private val sessions: SessionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(VerificationUiState())
    val state: StateFlow<VerificationUiState> = _state
    private var polling: Job? = null

    init {
        refreshStatus()
    }

    /** Starts (or resumes) a provider session; the screen opens `launchUrl` in a Custom Tab. */
    fun start() {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null, launchUrl = null) }
        viewModelScope.launch {
            apiCall { api.startVerification() }
                .onSuccess { s -> _state.update { it.copy(busy = false, launchUrl = s.launchUrl) } }
                .onFailure { e ->
                    val retry = (e as? ApiException)?.retryAfterSec
                    _state.update { it.copy(busy = false, error = e.userMessage(), status = it.status?.copy(retryAfterSec = retry ?: it.status?.retryAfterSec)) }
                }
        }
    }

    fun consumedLaunchUrl() {
        _state.update { it.copy(launchUrl = null) }
        startPolling()
    }

    fun refreshStatus() {
        viewModelScope.launch {
            apiCall { api.verificationStatus() }.onSuccess { status ->
                _state.update { it.copy(status = status) }
                if (status.verified) {
                    // Refresh the profile before cancelling the poller: this may run inside it.
                    sessions.refreshMe()
                    polling?.cancel()
                }
            }
        }
    }

    /** Poll while a session is pending (the provider webhook may land a few seconds after the user returns). */
    fun startPolling() {
        polling?.cancel()
        polling = viewModelScope.launch {
            repeat(30) {
                refreshStatus()
                delay(2_000)
                val s = _state.value.status
                if (s?.verified == true || (s != null && !s.pending && s.lastOutcome != null)) return@launch
            }
        }
    }
}
