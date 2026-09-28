package com.larea.app.feature.verification

import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.ui.components.HeroGlyph
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.ScreenScaffold
import com.larea.app.ui.components.StepRow
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing

@Composable
fun VerificationScreen(model: VerificationViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val activity = LocalContext.current as Activity
    ScreenScaffold(
        title = "Confirm you're 18 or older",
        subtitle = "Chats connect you with people standing next to you, so Larea is for adults only. Google Play confirms your age range in one step.",
        hero = { HeroGlyph(Icons.Filled.VerifiedUser) },
    ) {
        if (state.selfDeclare) {
            SelfDeclaration(busy = state.busy, onConfirm = model::declareAdult)
        } else {
            StepRow(1, "Tap Confirm my age", "Google Play asks whether you want to share your age range with Larea.")
            StepRow(2, "Allow sharing", "Only the range (for example 18+) is shared, never your birthday or ID.")
            StepRow(3, "You're in", "Nearby chats unlock immediately.")
            NoteCard(Icons.Filled.Lock, "Larea stores only that you passed. Your Google account keeps your age; Larea never sees a document.")
        }
        when (val outcome = state.outcome) {
            AgeOutcome.Declined -> InlineError("You need to share that you're 18 or older to use Larea.")
            AgeOutcome.UnderAge -> InlineError("Larea is for adults only.")
            AgeOutcome.UnknownAge -> InlineError("Google Play has no age on file for your account. Add your birthday to your Google account, then try again.")
            is AgeOutcome.Failed -> InlineError(outcome.message)
            null -> Unit
        }
        if (!state.selfDeclare) {
            PrimaryButton("Confirm my age", onClick = { model.confirm(activity) }, loading = state.busy, tag = "verify.start")
        }
    }
}

/** Where Google has no age range for this account or country, the user confirms it themselves. */
@Composable
private fun SelfDeclaration(busy: Boolean, onConfirm: () -> Unit) {
    val c = Larea.colors
    var checked by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.l)) {
        NoteCard(Icons.Filled.Lock, "Google Play can't confirm age ranges where you are yet, so we ask you directly. Larea stores only that you confirmed.")
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clickable(role = Role.Checkbox) { checked = !checked }
                .testTag("verify.self.check"),
        ) {
            Checkbox(checked = checked, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = c.brandPrimary))
            Text("I confirm that I'm 18 or older.", style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
        }
        Text(
            "Misstating your age breaks the community guidelines and gets the account suspended.",
            style = LareaType.footnote,
            color = c.secondaryText,
        )
        PrimaryButton("Continue", onClick = onConfirm, enabled = checked, loading = busy, tag = "verify.self.submit")
    }
}
