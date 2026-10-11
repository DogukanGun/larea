package com.larea.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.network.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(val busy: Boolean = false, val error: String? = null)

/** Forgot password: [codeSentTo] is set once a code was requested, which moves the flow to step 2. */
data class ResetUiState(val busy: Boolean = false, val error: String? = null, val codeSentTo: String? = null, val resent: Boolean = false)

@HiltViewModel
class AuthViewModel @Inject constructor(private val sessions: SessionRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state

    fun signIn(email: String, password: String) = run { sessions.login(email, password) }

    fun signUp(email: String, password: String, displayName: String) = run { sessions.register(email, password, displayName) }

    private val _reset = MutableStateFlow(ResetUiState())
    val reset: StateFlow<ResetUiState> = _reset

    fun sendResetCode(email: String) {
        if (_reset.value.busy) return
        val again = _reset.value.codeSentTo != null
        _reset.update { it.copy(busy = true, error = null, resent = false) }
        viewModelScope.launch {
            val error = sessions.forgotPassword(email).exceptionOrNull()?.userMessage()
            _reset.update {
                if (error != null) it.copy(busy = false, error = error)
                else it.copy(busy = false, codeSentTo = email.trim(), resent = again)
            }
        }
    }

    fun resetPassword(code: String, password: String) {
        val email = _reset.value.codeSentTo ?: return
        if (_reset.value.busy) return
        _reset.update { it.copy(busy = true, error = null, resent = false) }
        viewModelScope.launch {
            // On success the session is stored and the app router leaves the auth flow.
            val error = sessions.resetPassword(email, code, password).exceptionOrNull()?.userMessage()
            _reset.update { it.copy(busy = false, error = error) }
        }
    }

    /** Back to step 1, e.g. to fix a mistyped email. */
    fun changeResetEmail() = _reset.update { ResetUiState() }

    private fun run(block: suspend () -> Result<*>) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = block()
            _state.update { it.copy(busy = false, error = result.exceptionOrNull()?.userMessage()) }
        }
    }
}

