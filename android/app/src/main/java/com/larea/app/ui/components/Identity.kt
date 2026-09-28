package com.larea.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.larea.app.R
import com.larea.app.core.network.VenueCategory
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Rounded
import com.larea.app.ui.theme.Spacing
import com.larea.app.ui.theme.stableHash

/** Initials on a colour picked deterministically from the user id (same palette and hash as iOS). */
object AvatarPalette {
    val colors = listOf(
        Color(0.37f, 0.23f, 0.93f), // violet
        Color(1.00f, 0.42f, 0.36f), // coral
        Color(0.05f, 0.66f, 0.62f), // teal
        Color(0.96f, 0.62f, 0.10f), // amber
        Color(0.91f, 0.30f, 0.62f), // pink
        Color(0.16f, 0.50f, 0.96f), // blue
    )

    fun colorIndex(seed: String): Int = (stableHash(seed) % colors.size.toULong()).toInt()

    fun initials(name: String): String {
        val letters = name.split(' ', '_', '.').filter { it.isNotEmpty() }.take(2).map { it.first().uppercase() }
        return if (letters.isEmpty()) "?" else letters.joinToString("")
    }
}

@Composable
fun Avatar(name: String, seed: String, modifier: Modifier = Modifier, size: Dp = 36.dp) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(size)
            .background(AvatarPalette.colors[AvatarPalette.colorIndex(seed)], CircleShape)
            .clearAndSetSemantics { },
    ) {
        Text(AvatarPalette.initials(name), color = Color.White, fontFamily = Rounded, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * 0.38f).sp)
    }
}

@Composable
fun MemberRow(name: String, seed: String, modifier: Modifier = Modifier, isMe: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = modifier.padding(vertical = 2.dp)) {
        Avatar(name, seed, size = 36.dp)
        Text(name, style = LareaType.headline, color = Larea.colors.text, maxLines = 1, modifier = Modifier.weight(1f))
        if (isMe) Pill("You", style = PillStyle.Tint)
    }
}

@Composable
fun VenueIcon(category: VenueCategory, modifier: Modifier = Modifier, size: Dp = 44.dp, dimmed: Boolean = false) {
    val c = Larea.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(size).background(if (dimmed) c.fill else c.brandTint, CircleShape).clearAndSetSemantics { },
    ) {
        Icon(category.icon, contentDescription = null, tint = if (dimmed) c.secondaryText else c.brandPrimary, modifier = Modifier.size(size * 0.5f))
    }
}

/** Large tinted symbol used at the top of explainer screens. */
@Composable
fun HeroGlyph(icon: ImageVector, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier.size(96.dp).background(c.brandTint, RoundedCornerShape(28.dp)).clearAndSetSemantics { },
    ) {
        Icon(icon, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(46.dp))
    }
}

@Composable
fun LogoMark(modifier: Modifier = Modifier, size: Dp = 44.dp, tint: Color = Larea.colors.brandPrimary) {
    Icon(painterResource(R.drawable.ic_logo), contentDescription = null, tint = tint, modifier = modifier.size(size))
}

@Composable
fun Wordmark(modifier: Modifier = Modifier, logoSize: Dp = 40.dp, fontSize: Int = 38) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = "Larea" },
    ) {
        LogoMark(size = logoSize)
        Text("Larea", fontFamily = Rounded, fontWeight = FontWeight.Black, fontSize = fontSize.sp, color = Larea.colors.text)
    }
}
