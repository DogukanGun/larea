package com.larea.app.solana

import android.util.Base64
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.format.Base58
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WalletUiState(
    val wallet: WalletView? = null,
    val balances: WalletBalances? = null,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    /** "My stamps": null until opened. */
    val stamps: List<StampView>? = null,
    val stampsDasChecked: Boolean = false,
    val stampsLoading: Boolean = false,
    /** Loyalty per place, highest first. */
    val levels: List<LoyaltyView> = emptyList(),
)

@HiltViewModel
class WalletViewModel @Inject constructor(
    private val api: SolanaApi,
    private val adapter: WalletAdapter,
    private val sessions: SessionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(WalletUiState())
    val state: StateFlow<WalletUiState> = _state

    fun load() {
        viewModelScope.launch {
            apiCall { api.wallet() }
                .onSuccess { r ->
                    r.wallet?.let { adapter.useCluster(it.cluster) }
                    _state.update { it.copy(wallet = r.wallet, balances = r.balances, loading = false, error = null) }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.userMessage()) } }
            apiCall { api.levels() }.onSuccess { r -> _state.update { it.copy(levels = r.levels) } }
        }
    }

    /** Challenge from the backend → the wallet signs in → the backend verifies and links the address. */
    fun connect() {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            runCatching {
                val challenge = apiCall { api.challenge() }.getOrThrow()
                val signIn = adapter.signIn(challenge)
                val body = LinkWalletRequest(
                    address = Base58.encode(signIn.publicKey),
                    message = Base64.encodeToString(signIn.signedMessage, Base64.NO_WRAP),
                    signature = Base64.encodeToString(signIn.signature, Base64.NO_WRAP),
                )
                apiCall { api.link(body) }.getOrThrow()
            }.onSuccess {
                sessions.refreshMe()
                load()
            }.onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(busy = false) }
        }
    }

    fun loadStamps() {
        _state.update { it.copy(stampsLoading = true) }
        viewModelScope.launch {
            apiCall { api.stamps() }
                .onSuccess { r -> _state.update { it.copy(stamps = r.stamps, stampsDasChecked = r.dasChecked, stampsLoading = false) } }
                .onFailure { e -> _state.update { it.copy(stampsLoading = false, error = e.userMessage()) } }
        }
    }

    fun closeStamps() = _state.update { it.copy(stamps = null) }

    fun disconnect() {
        viewModelScope.launch {
            apiCall { api.unlink() }
                .onSuccess {
                    adapter.forget()
                    sessions.refreshMe()
                    _state.update { it.copy(wallet = null, balances = null) }
                }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
        }
    }
}
