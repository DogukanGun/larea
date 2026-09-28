package com.larea.app.feature.suspended

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.runtime.Composable
import com.larea.app.ui.components.HeroGlyph
import com.larea.app.ui.components.ScreenScaffold
import com.larea.app.ui.components.SecondaryButton

@Composable
fun SuspendedScreen(onSignOut: () -> Unit) {
    ScreenScaffold(
        title = "Account suspended",
        subtitle = "Your account was suspended after repeated guideline violations. A moderator will review it.",
        hero = { HeroGlyph(Icons.Filled.PanTool) },
    ) {
        SecondaryButton("Sign out", onClick = onSignOut)
    }
}
