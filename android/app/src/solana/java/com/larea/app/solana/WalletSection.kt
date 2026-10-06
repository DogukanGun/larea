package com.larea.app.solana

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.core.format.Base58
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.ListRow
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RowDivider
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import java.util.Locale

/** Profile → Wallet: connect a Solana wallet with Sign In With Solana, see balances, disconnect. */
@Composable
fun WalletSection(model: WalletViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    LaunchedEffect(Unit) { model.load() }

    SectionHeader("Wallet")
    val wallet = state.wallet
    if (wallet == null) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(horizontal = Spacing.screen)) {
            Text(
                "Connect your Solana wallet to check in at places, collect stamps you own, and tip people in USDC or SKR.",
                style = LareaType.subheadline,
                color = c.secondaryText,
            )
            state.error?.let { InlineError(it) }
            PrimaryButton("Connect wallet", onClick = model::connect, loading = state.busy, enabled = !state.loading, tag = "solana.wallet.connect")
        }
    } else {
        state.notice?.let { notice ->
            NoteCard(
                Icons.Filled.CardGiftcard,
                notice,
                Modifier.padding(horizontal = Spacing.screen).padding(bottom = Spacing.s).clickable(onClick = model::dismissNotice).testTag("solana.wallet.notice"),
            )
        }
        GroupedCard {
            ListRow(tag = "solana.wallet.address") {
                Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null, tint = c.brandPrimary)
                Column(Modifier.weight(1f)) {
                    Text(Base58.short(wallet.address), style = LareaType.headline, color = c.text)
                    val b = state.balances
                    if (b != null) {
                        Text(
                            "${fmt(b.sol)} SOL · ${fmt(b.usdc)} USDC · ${fmt(b.skr)} SKR",
                            style = LareaType.subheadline,
                            color = c.secondaryText,
                        )
                    }
                }
                Pill(wallet.cluster.replaceFirstChar { it.titlecase(Locale.ROOT) }, style = PillStyle.Neutral)
            }
            RowDivider(inset = 56)
            ListRow(onClick = model::loadStamps, tag = "solana.stamps.open") {
                Icon(Icons.Filled.Verified, contentDescription = null, tint = c.brandPrimary)
                Text("My stamps", style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
                if (state.stampsLoading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            }
            RowDivider(inset = 56)
            ListRow {
                TextButton(onClick = model::disconnect, modifier = Modifier.testTag("solana.wallet.disconnect")) {
                    Text("Disconnect wallet", color = c.danger)
                }
            }
        }
        state.error?.let { InlineError(it, Modifier.padding(horizontal = Spacing.screen, vertical = Spacing.s)) }
        SectionFooter("Stamps and level badges live in this wallet. Disconnecting keeps them there.")
        if (state.levels.isNotEmpty()) {
            SectionHeader("Your places")
            GroupedCard(Modifier.testTag("solana.levels")) {
                state.levels.forEachIndexed { i, level ->
                    if (i > 0) RowDivider(inset = 16)
                    ListRow {
                        Column(Modifier.weight(1f)) {
                            Text(level.venueName, style = LareaType.body, color = c.text, maxLines = 1)
                            val next = level.nextLevelAt?.let { " · ${it - level.stamps} to ${Levels.name(level.level + 1)}" }.orEmpty()
                            Text("${level.stamps} check-ins$next", style = LareaType.subheadline, color = c.secondaryText)
                        }
                        if (level.level >= Levels.REGULAR) LevelBadge(level.level) else Text(level.levelName, style = LareaType.subheadline, color = c.secondaryText)
                    }
                }
            }
            SectionFooter("Regulars get their own room at each place and can start polls.")
        }
        if (state.rewards.isNotEmpty()) {
            SectionHeader("SKR rewards")
            GroupedCard(Modifier.testTag("solana.rewards")) {
                state.rewards.forEachIndexed { i, reward ->
                    if (i > 0) RowDivider(inset = 16)
                    ListRow {
                        Column(Modifier.weight(1f)) {
                            Text("${reward.levelName} at ${reward.venueName}", style = LareaType.body, color = c.text, maxLines = 1)
                            Text(if (reward.status == "SENT") "Sent to your wallet" else "On its way", style = LareaType.subheadline, color = c.secondaryText)
                        }
                        Text("+${reward.amount} SKR", style = LareaType.headline, color = c.brandPrimary)
                    }
                }
            }
        }
    }
    state.stamps?.let { stamps -> StampsDialog(stamps, onDismiss = model::closeStamps) }
}

/** Every confirmed check-in: place, day and visit number, with the wallet check when the server has a DAS RPC. */
@Composable
private fun StampsDialog(stamps: List<StampView>, onDismiss: () -> Unit) {
    val c = Larea.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("My stamps", style = LareaType.headline) },
        text = {
            if (stamps.isEmpty()) {
                Text("No stamps yet. Check in at a place to collect your first one.", color = c.secondaryText)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.heightIn(max = 420.dp).testTag("solana.stamps.list")) {
                    items(stamps, key = { it.id }) { stamp ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.m)) {
                            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(40.dp).border(2.dp, c.brandPrimary, CircleShape)) {
                                Text("${stamp.visit}", style = LareaType.headline, color = c.brandPrimary)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(stamp.venueName, style = LareaType.body, color = c.text, maxLines = 1)
                                Text("${stamp.day} · visit ${stamp.visit}", style = LareaType.subheadline, color = c.secondaryText)
                            }
                            when (stamp.onChain) {
                                true -> Icon(Icons.Filled.Verified, contentDescription = "In your wallet", tint = c.brandPrimary, modifier = Modifier.size(18.dp))
                                false -> Icon(Icons.Filled.ErrorOutline, contentDescription = "Not found in your wallet", tint = c.danger, modifier = Modifier.size(18.dp))
                                null -> Unit
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.testTag("solana.stamps.done")) { Text("Done") } },
    )
}

private fun fmt(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else String.format(Locale.getDefault(), "%.2f", value)
