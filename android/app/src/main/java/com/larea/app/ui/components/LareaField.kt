package com.larea.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius

/**
 * Label above, 52dp filled field, 1.5dp brand border when focused (danger on error), optional error line.
 * Secure fields get a reveal toggle.
 */
@Composable
fun LareaField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    secure: Boolean = false,
    error: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
    focusRequester: FocusRequester = remember { FocusRequester() },
    tag: String? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 8,
    enabled: Boolean = true,
    onSubmit: () -> Unit = {},
) {
    val c = Larea.colors
    var reveal by rememberSaveable { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val border by animateColorAsState(
        when {
            error != null -> c.danger
            focused -> c.brandPrimary
            else -> Color.Transparent
        },
        label = "fieldBorder",
    )
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = LareaType.footnote.copy(fontWeight = FontWeight.Medium), color = c.secondaryText)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .background(c.fill, RoundedCornerShape(Radius.field))
                .border(1.5.dp, border, RoundedCornerShape(Radius.field))
                .padding(start = 14.dp, end = if (secure) 2.dp else 14.dp),
        ) {
            Box(Modifier.weight(1f).padding(vertical = 14.dp)) {
                if (value.isEmpty() && placeholder.isNotEmpty()) {
                    Text(placeholder, style = LareaType.body, color = c.tertiaryText)
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    singleLine = singleLine,
                    minLines = minLines,
                    maxLines = maxLines,
                    textStyle = LareaType.body.copy(color = c.text),
                    cursorBrush = SolidColor(c.brandPrimary),
                    interactionSource = interaction,
                    visualTransformation = if (secure && !reveal) PasswordVisualTransformation() else VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (secure && !reveal) KeyboardType.Password else keyboardType,
                        imeAction = imeAction,
                        capitalization = capitalization,
                        autoCorrectEnabled = false,
                    ),
                    keyboardActions = KeyboardActions(onAny = { onSubmit() }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .testTag(tag ?: "field.$label")
                        .semantics { contentDescription = label },
                )
            }
            if (secure) {
                IconButton(onClick = { reveal = !reveal }) {
                    Icon(
                        if (reveal) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (reveal) "Hide password" else "Show password",
                        tint = c.secondaryText,
                    )
                }
            }
        }
        AnimatedVisibility(visible = error != null, enter = fadeIn(), exit = fadeOut()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Filled.Error, contentDescription = null, tint = c.danger, modifier = Modifier.size(14.dp))
                Text(error.orEmpty(), style = LareaType.caption, color = c.danger)
            }
        }
    }
}
