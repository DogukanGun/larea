package com.larea.app.feature.verification

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.DebugFlags
import com.larea.app.core.age.AgeSignals
import com.larea.app.core.age.AgeSignalsAnswer
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.PlatformAgeRequest
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AgeOutcome {
    data object Declined : AgeOutcome
    data object UnderAge : AgeOutcome
    data object UnknownAge : AgeOutcome
    data class Failed(val message: String) : AgeOutcome
}

data class VerificationUiState(
    val busy: Boolean = false,
    val outcome: AgeOutcome? = null,
    /** Google had no answer: the user confirms 18+ themselves. */
    val selfDeclare: Boolean = false,
)

@HiltViewModel
class VerificationViewModel @Inject constructor(
    private val api: LareaApi,
    private val sessions: SessionRepository,
    private val ageSignals: AgeSignals,
) : ViewModel() {
    private val _state = MutableStateFlow(VerificationUiState())
    val state: StateFlow<VerificationUiState> = _state

    /** Asks Play Age Signals; forwards the range, or falls back to a self-declaration when Google has none. */
    fun confirm(activity: Activity) {
        if (_state.value.busy) return
        if (DebugFlags.testAgePass) return passForTests()
        _state.update { it.copy(busy = true, outcome = null) }
        viewModelScope.launch {
            when (val answer = ageSignals.request(activity)) {
                is AgeSignalsAnswer.Range -> send(PlatformAgeRequest("google", answer.lowerBound, answer.upperBound, answer.declaration))
                AgeSignalsAnswer.Declined -> send(PlatformAgeRequest("google", declaration = "unknown"))
                AgeSignalsAnswer.Unavailable -> _state.update { it.copy(busy = false, selfDeclare = true) }
            }
        }
    }

    /** The user's own confirmation that they are 18 or older. */
    fun declareAdult() {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, outcome = null) }
        viewModelScope.launch { send(PlatformAgeRequest("self", lowerBound = 18, declaration = "self")) }
    }

    private suspend fun send(request: PlatformAgeRequest) {
        apiCall { api.platformAge(request) }
            .onSuccess { result ->
                val outcome = when (result.reason) {
                    "under_age" -> AgeOutcome.UnderAge
                    "declined" -> AgeOutcome.Declined
                    "unknown_age" -> AgeOutcome.UnknownAge
                    else -> null
                }
                _state.update { it.copy(outcome = outcome) }
                if (result.verified) sessions.refreshMe()
            }
            .onFailure { e -> _state.update { it.copy(outcome = AgeOutcome.Failed(e.userMessage())) } }
        _state.update { it.copy(busy = false) }
    }

    /** UI tests: the backend's test-only shortcut (only exists when the backend runs with NODE_ENV=test). */
    private fun passForTests() {
        _state.update { it.copy(busy = true, outcome = null) }
        viewModelScope.launch {
            apiCall { api.testingVerifyAge() }
                .onSuccess { sessions.refreshMe() }
                .onFailure { e -> _state.update { it.copy(outcome = AgeOutcome.Failed(e.userMessage())) } }
            _state.update { it.copy(busy = false) }
        }
    }
}
