package com.larea.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.larea.app.R

/** Brand and semantic colours; mirrors the iOS asset catalog plus the system colours it leans on. */
@Immutable
data class LareaColors(
    val brandPrimary: Color,
    val brandDeep: Color,
    val brandTint: Color,
    val sunny: Color,
    val onSunny: Color,
    val success: Color,
    val danger: Color,
    val warning: Color,
    /** Screen background (iOS systemBackground). */
    val background: Color,
    /** List screens and the bottom panel (iOS systemGroupedBackground). */
    val grouped: Color,
    /** Rows and cards on a grouped screen (iOS secondarySystemGroupedBackground). */
    val card: Color,
    /** Field and chip fill (iOS tertiarySystemFill). */
    val fill: Color,
    val text: Color,
    val secondaryText: Color,
    val tertiaryText: Color,
    val separator: Color,
    val isDark: Boolean,
)

private val LightPalette = LareaColors(
    brandPrimary = Color(0xFF5E3BEE),
    brandDeep = Color(0xFF3A22B5),
    brandTint = Color(0x1F5E3BEE),
    sunny = Color(0xFFFFC84A),
    onSunny = Color(0xFF4D2E00),
    success = Color(0xFF1DB954),
    danger = Color(0xFFE5484D),
    warning = Color(0xFFFF9500),
    background = Color(0xFFFFFFFF),
    grouped = Color(0xFFF2F2F7),
    card = Color(0xFFFFFFFF),
    fill = Color(0x1F767680),
    text = Color(0xFF000000),
    secondaryText = Color(0x993C3C43),
    tertiaryText = Color(0x4D3C3C43),
    separator = Color(0x4A3C3C43),
    isDark = false,
)

private val DarkPalette = LareaColors(
    brandPrimary = Color(0xFF8B74FF),
    brandDeep = Color(0xFFC9BEFF),
    brandTint = Color(0x338B74FF),
    sunny = Color(0xFFFFD36A),
    onSunny = Color(0xFF4D2E00),
    success = Color(0xFF43D17A),
    danger = Color(0xFFFF6B6B),
    warning = Color(0xFFFF9F0A),
    background = Color(0xFF000000),
    grouped = Color(0xFF000000),
    card = Color(0xFF1C1C1E),
    fill = Color(0x3D767680),
    text = Color(0xFFFFFFFF),
    secondaryText = Color(0x99EBEBF5),
    tertiaryText = Color(0x4DEBEBF5),
    separator = Color(0x99545458),
    isDark = true,
)

val LocalLareaColors = staticCompositionLocalOf { LightPalette }

/** Spacing scale shared with iOS. */
object Spacing {
    val xs = 4.dp
    val s = 8.dp
    val m = 12.dp
    val l = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    /** Horizontal margin from the screen edge, shared by every screen, list and panel. */
    val screen = 16.dp
}

object Radius {
    val field = 14.dp
    val button = 16.dp
    val card = 20.dp
    val bubble = 20.dp
    val panel = 24.dp
}

private fun nunito(weight: Int) = Font(
    R.font.nunito_variable,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** Rounded display face (the counterpart of SF Rounded on iOS). */
val Rounded = FontFamily(nunito(400), nunito(500), nunito(600), nunito(700), nunito(800), nunito(900))

/** Display type: rounded and bold for titles, section titles, buttons and the wordmark; body text stays on the system face. */
object LareaType {
    val title = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, lineHeight = 38.sp)
    val title2 = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, lineHeight = 28.sp)
    val title3 = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, lineHeight = 25.sp)
    val headline = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.Bold, fontSize = 17.sp, lineHeight = 22.sp)
    val button = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.Bold, fontSize = 17.sp, lineHeight = 22.sp)
    val captionBold = TextStyle(fontFamily = Rounded, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, lineHeight = 16.sp)
    val body = TextStyle(fontSize = 17.sp, lineHeight = 22.sp)
    val subheadline = TextStyle(fontSize = 15.sp, lineHeight = 20.sp)
    val footnote = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)
    val caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp)
    val caption2 = TextStyle(fontSize = 11.sp, lineHeight = 13.sp)
}

private val MaterialType = Typography(
    headlineLarge = LareaType.title,
    headlineMedium = LareaType.title2,
    headlineSmall = LareaType.title3,
    titleLarge = LareaType.title3,
    titleMedium = LareaType.headline,
    titleSmall = LareaType.headline.copy(fontSize = 15.sp),
    labelLarge = LareaType.button.copy(fontSize = 15.sp),
    bodyLarge = LareaType.body,
    bodyMedium = LareaType.subheadline,
    bodySmall = LareaType.footnote,
)

private fun schemeFor(c: LareaColors) = if (c.isDark) {
    darkColorScheme(
        primary = c.brandPrimary, onPrimary = Color.White,
        primaryContainer = c.brandTint, onPrimaryContainer = c.brandDeep,
        secondary = c.brandDeep, onSecondary = Color.Black,
        secondaryContainer = c.brandTint, onSecondaryContainer = c.brandDeep,
        tertiary = c.sunny, onTertiary = c.onSunny,
        error = c.danger, onError = Color.White,
        background = c.background, onBackground = c.text,
        surface = c.card, onSurface = c.text,
        surfaceVariant = Color(0xFF2C2C2E), onSurfaceVariant = c.secondaryText,
        surfaceContainerLowest = Color.Black, surfaceContainerLow = Color(0xFF1C1C1E),
        surfaceContainer = Color(0xFF1C1C1E), surfaceContainerHigh = Color(0xFF2C2C2E), surfaceContainerHighest = Color(0xFF3A3A3C),
        outline = c.separator, outlineVariant = c.separator,
    )
} else {
    lightColorScheme(
        primary = c.brandPrimary, onPrimary = Color.White,
        primaryContainer = c.brandTint, onPrimaryContainer = c.brandDeep,
        secondary = c.brandDeep, onSecondary = Color.White,
        secondaryContainer = c.brandTint, onSecondaryContainer = c.brandDeep,
        tertiary = c.sunny, onTertiary = c.onSunny,
        error = c.danger, onError = Color.White,
        background = c.background, onBackground = c.text,
        surface = c.card, onSurface = c.text,
        surfaceVariant = Color(0xFFE5E5EA), onSurfaceVariant = c.secondaryText,
        surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF9F9FB),
        surfaceContainer = Color(0xFFF2F2F7), surfaceContainerHigh = Color(0xFFFFFFFF), surfaceContainerHighest = Color(0xFFE5E5EA),
        outline = c.separator, outlineVariant = c.separator,
    )
}

@Composable
fun LareaTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (darkTheme) DarkPalette else LightPalette
    CompositionLocalProvider(LocalLareaColors provides colors) {
        MaterialTheme(colorScheme = schemeFor(colors), typography = MaterialType, content = content)
    }
}

/** Shorthand: `Larea.colors.brandPrimary`. */
object Larea {
    val colors: LareaColors
        @Composable @ReadOnlyComposable get() = LocalLareaColors.current
}

/** FNV-1a 64-bit; stable across launches and identical to the iOS implementation. */
fun stableHash(value: String): ULong {
    var hash = 0xcbf29ce484222325UL
    for (byte in value.toByteArray(Charsets.UTF_8)) {
        hash = hash xor byte.toUByte().toULong()
        hash *= 0x100000001b3UL
    }
    return hash
}
