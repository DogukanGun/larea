package com.larea.app.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.network.BlockedUser
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.MeView
import com.larea.app.core.network.apiCall
import com.larea.app.feature.auth.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val me: MeView? = null,
    val blocks: List<BlockedUser> = emptyList(),
    val busy: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val api: LareaApi,
    private val sessions: SessionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(SettingsUiState())
    val state: StateFlow<SettingsUiState> = _state

    init {
        viewModelScope.launch { sessions.session.collect { s -> _state.update { it.copy(me = s?.user) } } }
        loadBlocks()
    }

    fun loadBlocks() {
        viewModelScope.launch { apiCall { api.blocks() }.onSuccess { res -> _state.update { it.copy(blocks = res.blocks) } } }
    }

    fun saveDisplayName(name: String) = busy {
        sessions.updateDisplayName(name).fold({ "Saved." }, { it.userMessage() })
    }

    fun unblock(userId: String) = busy {
        apiCall { api.unblock(userId) }.fold({ loadBlocks(); "Unblocked." }, { it.userMessage() })
    }

    fun signOut() = busy { sessions.signOut(); null }

    fun deleteAccount() = busy { sessions.deleteAccount().exceptionOrNull()?.userMessage() }

    fun clearMessage() = _state.update { it.copy(message = null) }

    private fun busy(block: suspend () -> String?) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            val message = block()
            _state.update { it.copy(busy = false, message = message) }
        }
    }
}
