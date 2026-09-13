package com.larea.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.NetworkException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(val busy: Boolean = false, val error: String? = null)

@HiltViewModel
class AuthViewModel @Inject constructor(private val sessions: SessionRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state

    fun signIn(email: String, password: String) = run { sessions.login(email, password) }

    fun signUp(email: String, password: String, displayName: String) = run { sessions.register(email, password, displayName) }

    private fun run(block: suspend () -> Result<*>) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = block()
            _state.update { it.copy(busy = false, error = result.exceptionOrNull()?.userMessage()) }
        }
    }
}

fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message
    is NetworkException -> "Can't reach Larea. Check your connection and try again."
    else -> message ?: "Something went wrong."
}
