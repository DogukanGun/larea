package com.larea.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing

enum class BannerKind { Info, Warning, Danger }

/** A slim status strip on bar material; sits at the top of a screen. */
@Composable
fun Banner(kind: BannerKind, text: String, modifier: Modifier = Modifier) {
    val c = Larea.colors
    val (icon, tint) = when (kind) {
        BannerKind.Info -> Icons.Filled.Info to c.brandPrimary
        BannerKind.Warning -> Icons.Filled.Warning to c.warning
        BannerKind.Danger -> Icons.Filled.Cancel to c.danger
    }
    Column(modifier.fillMaxWidth().background(c.card.copy(alpha = 0.96f)).clearAndSetSemantics { contentDescription = text }) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier.padding(horizontal = Spacing.l, vertical = 10.dp),
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            Text(text, style = LareaType.subheadline, color = c.text)
        }
        HorizontalDivider(color = c.separator, thickness = 0.5.dp)
    }
}

/** Inline error card used inside forms. */
@Composable
fun InlineError(text: String, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = modifier
            .fillMaxWidth()
            .background(c.danger.copy(alpha = 0.10f), RoundedCornerShape(Radius.field))
            .padding(Spacing.m),
    ) {
        Icon(Icons.Filled.Error, contentDescription = null, tint = c.danger, modifier = Modifier.size(20.dp))
        Text(text, style = LareaType.subheadline, color = c.text)
    }
}

/** Soft tinted card for privacy notes and hints. */
@Composable
fun NoteCard(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = modifier
            .fillMaxWidth()
            .background(c.brandTint, RoundedCornerShape(Radius.card))
            .padding(Spacing.l),
    ) {
        Icon(icon, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(22.dp))
        Text(text, style = LareaType.subheadline, color = c.brandDeep)
    }
}

/** Centered icon, title, description and optional actions (iOS ContentUnavailableView). */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    iconTint: Color = Larea.colors.secondaryText,
    actions: @Composable () -> Unit = {},
) {
    val c = Larea.colors
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = modifier.fillMaxWidth().padding(horizontal = Spacing.xl, vertical = Spacing.xl),
    ) {
        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(48.dp))
        Text(title, style = LareaType.title3, color = c.text, textAlign = TextAlign.Center)
        if (description != null) {
            Text(description, style = LareaType.subheadline, color = c.secondaryText, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 420.dp))
        }
        Column(Modifier.padding(top = Spacing.s), horizontalAlignment = Alignment.CenterHorizontally) { actions() }
    }
}
