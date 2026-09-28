package com.larea.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing

/** Explainer / form screen: optional hero, rounded title, subtitle, then content. Scrolls and keeps clear of the keyboard. */
@Composable
fun ScreenScaffold(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    titleTag: String? = null,
    hero: (@Composable () -> Unit)? = null,
    topBar: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Larea.colors
    Column(modifier.fillMaxSize().background(c.background)) {
        if (topBar != null) topBar() else Box(Modifier.statusBarsPadding())
        Column(
            verticalArrangement = Arrangement.spacedBy(Spacing.l),
            modifier = Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.screen)
                .padding(bottom = Spacing.xxl)
                .navigationBarsPadding(),
        ) {
            if (hero != null) {
                Box(Modifier.fillMaxWidth().padding(top = Spacing.xl), contentAlignment = Alignment.Center) { hero() }
            }
            Text(
                title,
                style = LareaType.title,
                color = c.text,
                modifier = Modifier.semantics { heading() }.let { if (titleTag != null) it.testTag(titleTag) else it },
            )
            if (subtitle != null) Text(subtitle, style = LareaType.body, color = c.secondaryText)
            content()
        }
    }
}

/** Numbered step row for explainers. */
@Composable
fun StepRow(number: Int, title: String, detail: String, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.m), modifier = modifier) {
        Box(Modifier.size(28.dp).background(c.brandTint, CircleShape), contentAlignment = Alignment.Center) {
            Text("$number", style = LareaType.captionBold, color = c.brandDeep)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = LareaType.headline, color = c.text)
            Text(detail, style = LareaType.subheadline, color = c.secondaryText)
        }
    }
}

/** Top bar in the app's type: rounded title, optional back arrow and actions, on the given background. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LareaTopBar(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    backTag: String? = null,
    background: Color = Larea.colors.grouped,
    navigationIcon: (@Composable () -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val c = Larea.colors
    TopAppBar(
        title = {
            Column {
                Text(title, style = LareaType.headline, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) Text(subtitle, style = LareaType.caption, color = c.secondaryText, maxLines = 1)
            }
        },
        navigationIcon = {
            when {
                navigationIcon != null -> navigationIcon()
                onBack != null -> IconButton(onClick = onBack, modifier = if (backTag != null) Modifier.testTag(backTag) else Modifier) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = c.brandPrimary)
                }
            }
        },
        actions = actions,
        windowInsets = TopAppBarDefaults.windowInsets,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = background, scrolledContainerColor = background),
        modifier = modifier,
    )
}

/** Header above a grouped section, in the iOS inset-grouped style. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = LareaType.footnote,
        color = Larea.colors.secondaryText,
        modifier = modifier.padding(start = Spacing.l, end = Spacing.l, top = Spacing.l, bottom = 6.dp).semantics { heading() },
    )
}

@Composable
fun SectionFooter(text: String, modifier: Modifier = Modifier) {
    Text(text, style = LareaType.footnote, color = Larea.colors.secondaryText, modifier = modifier.padding(horizontal = Spacing.l, vertical = 6.dp))
}

/** Rounded card holding rows on a grouped background (iOS inset-grouped list section). */
@Composable
fun GroupedCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.screen)
            .background(Larea.colors.card, RoundedCornerShape(Radius.card)),
        content = content,
    )
}

/** One row of a grouped card: 16dp inset, at least 52dp tall, optionally tappable. */
@Composable
fun ListRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    tag: String? = null,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .let { if (tag != null) it.testTag(tag) else it }
            .padding(horizontal = Spacing.l, vertical = 10.dp),
        content = content,
    )
}

@Composable
fun RowDivider(modifier: Modifier = Modifier, inset: Int = 16) {
    HorizontalDivider(modifier.padding(start = inset.dp), color = Larea.colors.separator, thickness = 0.5.dp)
}


/** Popups, sheets and dialogs are separate windows: expose their test tags as resource ids too (UI tests, adb). */
fun Modifier.exposeTestTags(): Modifier = semantics { testTagsAsResourceId = true }
