package com.larea.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.larea.app.core.format.Money
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType

enum class PillStyle { Sunny, Tint, Success, Neutral }

@Composable
fun Pill(text: String, modifier: Modifier = Modifier, style: PillStyle = PillStyle.Tint, icon: ImageVector? = null) {
    val c = Larea.colors
    val (bg, fg) = when (style) {
        PillStyle.Sunny -> c.sunny to c.onSunny
        PillStyle.Tint -> c.brandTint to c.brandDeep
        PillStyle.Success -> c.success.copy(alpha = 0.15f) to c.success
        PillStyle.Neutral -> c.fill to c.secondaryText
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = modifier.background(bg, CircleShape).padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(12.dp))
        Text(text, style = LareaType.captionBold, color = fg, maxLines = 1)
    }
}

enum class PriceTagStyle { Filled, Plain, Sunny }

/** A price in a capsule: filled (map pins), plain (lists) or sunny (selected pin). */
@Composable
fun PriceTag(cents: Int, modifier: Modifier = Modifier, currency: String = "eur", large: Boolean = false, style: PriceTagStyle = PriceTagStyle.Filled) {
    val c = Larea.colors
    val (bg, fg) = when (style) {
        PriceTagStyle.Filled -> c.brandPrimary to Color.White
        PriceTagStyle.Plain -> c.brandTint to c.brandDeep
        PriceTagStyle.Sunny -> c.sunny to c.onSunny
    }
    val filled = style == PriceTagStyle.Filled
    Text(
        Money.format(cents, currency),
        style = if (large) LareaType.title2 else LareaType.captionBold,
        color = fg,
        maxLines = 1,
        modifier = modifier
            .shadow(if (filled) 4.dp else 0.dp, CircleShape, clip = false)
            .background(bg, CircleShape)
            .border(2.dp, if (filled) Color.White.copy(alpha = 0.9f) else Color.Transparent, CircleShape)
            .padding(horizontal = if (large) 14.dp else 9.dp, vertical = if (large) 8.dp else 4.dp),
    )
}

@Composable
fun FilterChip(title: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    val c = Larea.colors
    val fg = if (selected) Color.White else c.text
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = modifier
            .height(36.dp)
            .background(if (selected) c.brandPrimary else c.fill, CircleShape)
            .clickable(role = Role.Checkbox, onClick = onClick)
            .semantics { this.selected = selected }
            .padding(horizontal = 14.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
        Text(title, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = fg, maxLines = 1)
    }
}
