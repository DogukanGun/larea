package com.larea.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import kotlinx.coroutines.launch
import kotlin.math.abs

enum class PanelDetent { Small, Medium, Large }

@Stable
class BottomPanelState(initial: PanelDetent) {
    var detent by mutableStateOf(initial)
}

@Composable
fun rememberBottomPanelState(initial: PanelDetent = PanelDetent.Medium): BottomPanelState {
    var saved by rememberSaveable { mutableStateOf(initial) }
    val state = remember { BottomPanelState(saved) }
    LaunchedEffect(state.detent) { saved = state.detent }
    return state
}

private val SmallHeight = 150.dp

/**
 * A draggable card pinned to the bottom of its container with three stops (150dp, half, full − 24dp).
 * The header strip is the drag surface; the content (usually a lazy list) scrolls on its own.
 * TalkBack users get "Expand panel" / "Shrink panel" actions.
 */
@Composable
fun BottomPanel(
    state: BottomPanelState,
    modifier: Modifier = Modifier,
    header: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Larea.colors
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    BoxWithConstraints(modifier.fillMaxSize()) {
        val total = with(density) { maxHeight.toPx() }
        val small = with(density) { SmallHeight.toPx() }
        val stops = mapOf(
            PanelDetent.Small to small,
            PanelDetent.Medium to maxOf(small, total * 0.5f),
            PanelDetent.Large to maxOf(small, total - with(density) { 24.dp.toPx() }),
        )
        val height = remember { Animatable(stops.getValue(state.detent)) }
        var dragging by remember { mutableStateOf(false) }
        LaunchedEffect(state.detent, total) {
            if (!dragging) height.animateTo(stops.getValue(state.detent), spring(dampingRatio = 0.86f, stiffness = 380f))
        }
        val dragState = rememberDraggableState { delta ->
            scope.launch { height.snapTo((height.value - delta).coerceIn(small, stops.getValue(PanelDetent.Large))) }
        }
        val all = PanelDetent.entries
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(with(density) { height.value.toDp() })
                .shadow(12.dp, RoundedCornerShape(topStart = Radius.panel, topEnd = Radius.panel), clip = false)
                .background(c.grouped, RoundedCornerShape(topStart = Radius.panel, topEnd = Radius.panel)),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.s),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = Spacing.s)
                    .testTag("panel.handle")
                    .draggable(
                        state = dragState,
                        orientation = Orientation.Vertical,
                        onDragStarted = { dragging = true },
                        onDragStopped = { velocity ->
                            // Project where a fling would land and snap to the nearest stop.
                            val projected = height.value - velocity * 0.2f
                            val target = stops.minBy { abs(it.value - projected) }.key
                            dragging = false
                            if (target == state.detent) height.animateTo(stops.getValue(target), spring(dampingRatio = 0.86f, stiffness = 380f))
                            state.detent = target
                        },
                    )
                    .semantics {
                        customActions = listOf(
                            CustomAccessibilityAction("Expand panel") {
                                state.detent = all[minOf(all.indexOf(state.detent) + 1, all.lastIndex)]; true
                            },
                            CustomAccessibilityAction("Shrink panel") {
                                state.detent = all[maxOf(all.indexOf(state.detent) - 1, 0)]; true
                            },
                        )
                    },
            ) {
                Box(Modifier.padding(top = 8.dp).size(width = 36.dp, height = 5.dp).background(c.tertiaryText, CircleShape))
                header()
            }
            content()
        }
    }
}
