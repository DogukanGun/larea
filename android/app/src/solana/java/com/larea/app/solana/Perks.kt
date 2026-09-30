package com.larea.app.solana

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PerksUiState(val perks: List<PerkView> = emptyList(), val claiming: String? = null, val message: String? = null)

@HiltViewModel
class PerksViewModel @Inject constructor(private val api: SolanaApi) : ViewModel() {
    private val _state = MutableStateFlow(PerksUiState())
    val state: StateFlow<PerksUiState> = _state

    fun load(venueId: String) {
        viewModelScope.launch {
            apiCall { api.perks(venueId) }.onSuccess { r -> _state.update { it.copy(perks = r.perks) } }
        }
    }

    fun claim(perk: PerkView) {
        if (_state.value.claiming != null) return
        _state.update { it.copy(claiming = perk.id, message = null) }
        viewModelScope.launch {
            apiCall { api.claimPerk(perk.id) }
                .onSuccess { claimed ->
                    _state.update { s -> s.copy(perks = s.perks.map { if (it.id == claimed.id) it.copy(claimed = true) else it }, message = "${claimed.amount} SKR is on its way to your wallet.") }
                }
                .onFailure { e -> _state.update { it.copy(message = e.userMessage()) } }
            _state.update { it.copy(claiming = null) }
        }
    }
}

/** Running perks at a place: what holders get, and a claim button for SKR drops. Nothing when none run. */
@Composable
fun VenuePerksList(venueId: String, model: PerksViewModel = hiltViewModel(key = "perks-$venueId")) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    LaunchedEffect(venueId) { model.load(venueId) }
    if (state.perks.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.xs).testTag("solana.perks")) {
        state.perks.forEach { perk ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.s),
                modifier = Modifier.fillMaxWidth().background(c.brandTint, RoundedCornerShape(14.dp)).padding(horizontal = Spacing.m, vertical = Spacing.s),
            ) {
                Icon(if (perk.eligible) Icons.Filled.CardGiftcard else Icons.Filled.Lock, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(20.dp))
                Column(Modifier.weight(1f)) {
                    Text(perk.title, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.text)
                    val detail = if (perk.eligible) perk.description.ifBlank { perk.amount?.let { "$it SKR for ${perk.minLevelName}s here" } ?: "" } else "For ${perk.minLevelName}s here"
                    if (detail.isNotBlank()) Text(detail, style = LareaType.footnote, color = c.secondaryText)
                }
                if (perk.kind == "SKR_DROP" && perk.eligible) {
                    if (perk.claimed) {
                        Text("Claimed", style = LareaType.footnote, color = c.secondaryText)
                    } else {
                        TextButton(onClick = { model.claim(perk) }, enabled = state.claiming == null, modifier = Modifier.testTag("solana.perk.claim.${perk.id}")) {
                            Text("Claim ${perk.amount} SKR", color = c.brandPrimary)
                        }
                    }
                }
            }
        }
        state.message?.let { Text(it, style = LareaType.footnote, color = c.secondaryText) }
    }
}
