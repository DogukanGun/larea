package com.larea.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.larea.app.core.format.Money
import com.larea.app.core.network.Listing
import com.larea.app.core.network.ListingKind
import com.larea.app.core.network.ListingStatus
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Rounded
import com.larea.app.ui.theme.Spacing

/** One poll option: a tappable bar that fills to its share of the votes once results are shown. */
@Composable
fun PollBar(
    text: String,
    fraction: Float,
    percent: Int,
    selected: Boolean,
    showResults: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = Larea.colors
    val fill by animateFloatAsState(if (showResults) fraction.coerceIn(0f, 1f) else 0f, spring(stiffness = 300f), label = "pollFill")
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(Radius.field))
            .background(c.fill)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = if (showResults) "$text, $percent percent" else text
                this.selected = selected
            },
    ) {
        if (showResults) {
            Box(Modifier.matchParentSize()) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(fill).background(if (selected) c.brandPrimary.copy(alpha = 0.28f) else c.brandTint))
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Spacing.s),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp).clearAndSetSemantics { },
        ) {
            if (selected) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(20.dp))
            Text(
                text,
                style = LareaType.body.copy(fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal),
                color = c.text,
                maxLines = 2,
                modifier = Modifier.weight(1f),
            )
            if (showResults) Text("$percent%", style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.secondaryText)
        }
    }
}

/** Progress through a fixed set of steps; `failed` paints the current step red. */
@Composable
fun StatusStepper(steps: List<String>, current: Int?, modifier: Modifier = Modifier, failed: Boolean = false) {
    val c = Larea.colors
    val description = current?.let { "Step ${it + 1} of ${steps.size}: ${steps[it]}" } ?: "Deal ended"
    Row(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description }, verticalAlignment = Alignment.Top) {
        steps.forEachIndexed { index, title ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                val color = when {
                    current == null -> c.fill
                    failed && index == current -> c.danger
                    index < current -> c.success
                    index == current -> c.brandPrimary
                    else -> c.fill
                }
                Box(Modifier.size(26.dp).background(color, CircleShape), contentAlignment = Alignment.Center) {
                    when {
                        current != null && index < current -> Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(14.dp))
                        failed && index == (current ?: 0) -> Icon(Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.size(14.dp))
                        else -> Text("${index + 1}", style = LareaType.caption.copy(fontWeight = FontWeight.Bold), color = if (index == current) Color.White else c.secondaryText)
                    }
                }
                Text(
                    title,
                    style = LareaType.caption2.copy(fontWeight = FontWeight.SemiBold),
                    color = if (index == current) c.text else c.secondaryText,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
            if (index < steps.lastIndex) {
                Box(
                    Modifier
                        .padding(top = 12.dp)
                        .widthIn(max = 40.dp)
                        .weight(0.4f)
                        .height(3.dp)
                        .background(if (current != null && index < current) c.success else c.fill),
                )
            }
        }
    }
}

/** Six digits, large and spaced, for the handover code. */
@Composable
fun CodeEntryField(code: String, onCodeChange: (String) -> Unit, modifier: Modifier = Modifier, tag: String = "code.field") {
    val c = Larea.colors
    BasicTextField(
        value = code,
        onValueChange = { value -> onCodeChange(value.filter(Char::isDigit).take(6)) },
        singleLine = true,
        textStyle = LareaType.title.copy(fontFamily = Rounded, fontSize = 34.sp, letterSpacing = 8.sp, textAlign = TextAlign.Center, color = c.text),
        cursorBrush = SolidColor(c.brandPrimary),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.Center) {
                if (code.isEmpty()) {
                    Text("000000", style = LareaType.title.copy(fontSize = 34.sp, letterSpacing = 8.sp), color = c.tertiaryText, textAlign = TextAlign.Center)
                }
                inner()
            }
        },
        modifier = modifier
            .fillMaxWidth()
            .background(c.fill, RoundedCornerShape(Radius.field))
            .padding(vertical = 14.dp)
            .testTag(tag)
            .semantics { contentDescription = "Handover code" },
    )
}

enum class ListingCardLayout { Row, Card, Compact }

/** A listing in a list row (thumbnail left), a card (photo on top) or a compact line. */
@Composable
fun ListingCard(listing: Listing, modifier: Modifier = Modifier, layout: ListingCardLayout = ListingCardLayout.Row) {
    val c = Larea.colors
    val meta = listOfNotNull(listing.category.label, listing.distanceText).joinToString(" · ")
    val kindStyle = if (listing.kind == ListingKind.REQUEST) PillStyle.Sunny else PillStyle.Neutral
    when (layout) {
        ListingCardLayout.Row -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = modifier.padding(vertical = 4.dp)) {
            RemoteImage(listing.images.firstOrNull()?.thumbnailUrl, Modifier.size(72.dp).clip(RoundedCornerShape(Radius.field)))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
                Text(listing.title, style = LareaType.headline, color = c.text, maxLines = 2)
                Text(meta, style = LareaType.subheadline, color = c.secondaryText, maxLines = 1)
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
                    PriceTag(listing.priceCents, currency = listing.currency, style = PriceTagStyle.Plain)
                    Pill(listing.kind.label, style = kindStyle)
                    if (listing.status != ListingStatus.ACTIVE) Pill(listing.status.label, style = PillStyle.Neutral)
                }
            }
        }
        ListingCardLayout.Card -> Column(verticalArrangement = Arrangement.spacedBy(Spacing.s), modifier = modifier) {
            RemoteImage(listing.images.firstOrNull()?.thumbnailUrl, Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(Radius.card)))
            Text(listing.title, style = LareaType.title3, color = c.text, maxLines = 2)
            Text(meta, style = LareaType.subheadline, color = c.secondaryText)
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), verticalAlignment = Alignment.CenterVertically) {
                PriceTag(listing.priceCents, currency = listing.currency, large = true, style = PriceTagStyle.Plain)
                Pill(listing.kind.label, style = kindStyle)
            }
        }
        ListingCardLayout.Compact -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = modifier) {
            RemoteImage(listing.images.firstOrNull()?.thumbnailUrl, Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)))
            Text(listing.title, style = LareaType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = c.text, maxLines = 1, modifier = Modifier.weight(1f))
            Text(Money.format(listing.priceCents, listing.currency), style = LareaType.subheadline, color = c.secondaryText)
        }
    }
}
