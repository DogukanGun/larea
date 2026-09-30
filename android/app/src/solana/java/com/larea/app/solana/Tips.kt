package com.larea.app.solana

import android.util.Base64
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.network.Author
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TipUiState(
    val token: String = "USDC",
    val amount: String = "1",
    val step: String? = null,
    val error: String? = null,
    val done: Boolean = false,
) {
    /** Plain decimal with at most 6 places, 0.01 … 1000 (the server has the final word). */
    val valid: Boolean get() = TIP_AMOUNT.matches(amount) && (amount.toDoubleOrNull() ?: 0.0) in 0.01..1000.0

    private companion object {
        val TIP_AMOUNT = Regex("^\\d{1,4}(\\.\\d{1,6})?$")
    }
}

/** Tip flow: Larea builds the transfer, the wallet signs, Larea sends it and the chat announces it. */
@HiltViewModel
class TipViewModel @Inject constructor(
    private val api: SolanaApi,
    private val adapter: WalletAdapter,
) : ViewModel() {
    private val _state = MutableStateFlow(TipUiState())
    val state: StateFlow<TipUiState> = _state

    fun reset() {
        _state.value = TipUiState()
    }

    fun setToken(token: String) = _state.update { it.copy(token = token) }
    fun setAmount(amount: String) = _state.update { it.copy(amount = amount.replace(',', '.').filter { c -> c.isDigit() || c == '.' }.take(11), error = null) }

    fun send(venueId: String, to: Author) {
        val s = _state.value
        if (!s.valid || s.step != null) return
        viewModelScope.launch {
            runCatching {
                _state.update { it.copy(step = "Preparing…", error = null) }
                val prepared = apiCall { api.tip(venueId, CreateTipRequest(to.id, s.token, s.amount)) }.getOrThrow()
                adapter.useCluster(prepared.cluster)
                _state.update { it.copy(step = "Approve in your wallet…") }
                val signed = adapter.signTransactions(listOf(Base64.decode(prepared.transaction, Base64.NO_WRAP))).single()
                val body = SubmitStampRequest(Base64.encodeToString(signed, Base64.NO_WRAP))
                _state.update { it.copy(step = "Sending…") }
                var tip = apiCall { api.submitTip(prepared.tip.id, body) }.getOrThrow()
                repeat(30) {
                    if (tip.status != "PENDING") return@repeat
                    delay(1_500)
                    tip = apiCall { api.submitTip(prepared.tip.id, body) }.getOrThrow()
                }
                when (tip.status) {
                    "CONFIRMED" -> Unit
                    "FAILED" -> throw WalletException("The tip didn't go through${tip.error?.let { " ($it)" } ?: ""}.")
                    else -> throw WalletException("Your tip is still on its way. It will show in the chat once it lands.")
                }
            }.onSuccess { _state.update { it.copy(step = null, done = true) } }
                .onFailure { e -> _state.update { it.copy(step = null, error = e.userMessage()) } }
        }
    }
}

@Composable
fun TipDialogContent(venueId: String, recipient: Author, onDismiss: () -> Unit, model: TipViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    LaunchedEffect(recipient.id) { model.reset() }
    LaunchedEffect(state.done) { if (state.done) onDismiss() }
    AlertDialog(
        onDismissRequest = { if (state.step == null) onDismiss() },
        title = { Text("Tip ${recipient.displayName}", style = LareaType.headline) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.testTag("solana.tip.sheet")) {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    listOf("USDC", "SKR").forEach { token ->
                        FilterChip(
                            selected = state.token == token,
                            onClick = { model.setToken(token) },
                            label = { Text(token) },
                            modifier = Modifier.testTag("solana.tip.token.$token"),
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                    listOf("1", "2", "5").forEach { preset ->
                        FilterChip(selected = state.amount == preset, onClick = { model.setAmount(preset) }, label = { Text(preset) })
                    }
                }
                OutlinedTextField(
                    value = state.amount,
                    onValueChange = model::setAmount,
                    label = { Text("Amount (${state.token})") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().testTag("solana.tip.amount"),
                )
                Text("Goes straight from your wallet to theirs. Your wallet pays the network fee.", style = LareaType.footnote, color = c.secondaryText)
                state.step?.let { Text(it, style = LareaType.subheadline, color = c.secondaryText) }
                state.error?.let { InlineError(it) }
            }
        },
        confirmButton = {
            PrimaryButton(
                "Send ${state.amount} ${state.token}",
                onClick = { model.send(venueId, recipient) },
                loading = state.step != null,
                enabled = state.valid,
                tag = "solana.tip.send",
            )
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = state.step == null) { Text("Cancel") } },
    )
}
