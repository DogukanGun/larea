package com.larea.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius

private val ChunkyHeight = 54.dp

/** Filled brand button, full width, 54dp; shows a spinner while loading. */
@Composable
fun PrimaryButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    loading: Boolean = false,
    enabled: Boolean = true,
    tag: String? = null,
) {
    val c = Larea.colors
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(Radius.button),
        colors = ButtonDefaults.buttonColors(
            containerColor = c.brandPrimary,
            contentColor = Color.White,
            disabledContainerColor = if (loading) c.brandPrimary else c.fill,
            disabledContentColor = if (loading) Color.White else c.tertiaryText,
        ),
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ChunkyHeight)
            .testTag(tag ?: "button.$title"),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(title, style = LareaType.button, modifier = Modifier.alpha(if (loading) 0f else 1f))
            if (loading) CircularProgressIndicator(color = Color.White, strokeWidth = 2.5.dp, modifier = Modifier.size(22.dp))
        }
    }
}

/** Tinted brand button (iOS `.bordered`), full width, 54dp. */
@Composable
fun SecondaryButton(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tag: String? = null,
) {
    val c = Larea.colors
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(Radius.button),
        colors = ButtonDefaults.buttonColors(
            containerColor = c.brandTint,
            contentColor = c.brandPrimary,
            disabledContainerColor = c.fill,
            disabledContentColor = c.tertiaryText,
        ),
        elevation = null,
        modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = ChunkyHeight).testTag(tag ?: "button.$title"),
    ) {
        Text(title, style = LareaType.button)
    }
}

/** Small text-only action used under forms ("New here? Create an account"). */
@Composable
fun LinkButton(title: String, onClick: () -> Unit, modifier: Modifier = Modifier, tag: String? = null, color: Color = Larea.colors.brandPrimary) {
    TextButton(onClick = onClick, modifier = modifier.fillMaxWidth().let { if (tag != null) it.testTag(tag) else it }) {
        Text(title, style = LareaType.subheadline.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = color)
    }
}
