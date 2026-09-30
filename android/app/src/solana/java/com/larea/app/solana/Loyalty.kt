package com.larea.app.solana

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.network.apiCall
import com.larea.app.feature.chat.MAIN_ROOM
import com.larea.app.feature.chat.REGULARS_ROOM
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Level 1 Visitor … 4 Legend, as the backend counts them from confirmed stamps. */
object Levels {
    const val REGULAR = 2
    val names = listOf("", "Visitor", "Regular", "Local", "Legend")

    fun name(level: Int): String = names.getOrElse(level) { "" }

    fun color(level: Int): Color = when (level) {
        2 -> Color(0xFFFF5A36)
        3 -> Color(0xFF7B61FF)
        4 -> Color(0xFFE0A100)
        else -> Color(0xFF8E8E93)
    }
}

/** A small tag after an author's name; Visitors (level 1) get none to keep the chat calm. */
@Composable
fun LevelBadge(level: Int, modifier: Modifier = Modifier) {
    if (level < Levels.REGULAR) return
    val color = Levels.color(level)
    Text(
        Levels.name(level),
        style = LareaType.caption2.copy(fontWeight = FontWeight.Bold),
        color = color,
        modifier = modifier
            .background(color.copy(alpha = 0.14f), RoundedCornerShape(50))
            .padding(horizontal = 6.dp, vertical = 1.dp)
            .semantics { contentDescription = "${Levels.name(level)} here" },
    )
}

@HiltViewModel
class PlaceLoyaltyViewModel @Inject constructor(private val api: SolanaApi) : ViewModel() {
    private val _loyalty = MutableStateFlow<LoyaltyView?>(null)
    val loyalty: StateFlow<LoyaltyView?> = _loyalty
    private val _regularAt = MutableStateFlow(5)
    val regularAt: StateFlow<Int> = _regularAt

    fun load(venueId: String) {
        viewModelScope.launch {
            apiCall { api.venueStamp(venueId) }.onSuccess { status ->
                _loyalty.value = status.loyalty
                if (status.loyalty?.level == 1) status.loyalty.nextLevelAt?.let { _regularAt.value = it }
            }
        }
    }
}

/** "Everyone | Regulars" under the chat's top bar; Regulars stays locked below level 2. */
@Composable
fun RoomSwitchBar(venueId: String, room: String, onRoom: (String) -> Unit, model: PlaceLoyaltyViewModel = hiltViewModel(key = "loyalty-$venueId")) {
    val loyalty by model.loyalty.collectAsStateWithLifecycle()
    val regularAt by model.regularAt.collectAsStateWithLifecycle()
    val c = Larea.colors
    var hint by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(venueId) { model.load(venueId) }
    val level = loyalty?.level ?: 0
    val unlocked = level >= Levels.REGULAR

    Column(Modifier.fillMaxWidth().padding(horizontal = Spacing.screen, vertical = Spacing.s)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.fillMaxWidth().background(c.fill, RoundedCornerShape(50)).padding(3.dp),
        ) {
            Segment("Everyone", selected = room == MAIN_ROOM, locked = false, tag = "chat.room.main", modifier = Modifier.weight(1f)) { onRoom(MAIN_ROOM) }
            Segment("Regulars", selected = room == REGULARS_ROOM, locked = !unlocked, tag = "chat.room.regulars", modifier = Modifier.weight(1f)) {
                if (unlocked) {
                    hint = null
                    onRoom(REGULARS_ROOM)
                } else {
                    val have = loyalty?.stamps ?: 0
                    hint = "The Regulars room opens after $regularAt check-ins here. You have $have."
                }
            }
        }
        hint?.let { Text(it, style = LareaType.footnote, color = c.secondaryText, modifier = Modifier.padding(top = Spacing.xs).testTag("chat.room.hint")) }
    }
}

@Composable
private fun Segment(text: String, selected: Boolean, locked: Boolean, tag: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = Larea.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .background(if (selected) c.card else Color.Transparent, RoundedCornerShape(50))
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(vertical = 6.dp)
            .semantics { this.selected = selected }
            .testTag(tag),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (locked) Icon(Icons.Filled.Lock, contentDescription = "Locked", tint = c.secondaryText, modifier = Modifier.size(14.dp))
            Text(text, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = if (selected) c.text else c.secondaryText)
        }
    }
}
