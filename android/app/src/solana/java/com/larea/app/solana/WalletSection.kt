package com.larea.app.solana

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
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
            ListRow {
                TextButton(onClick = model::disconnect, modifier = Modifier.testTag("solana.wallet.disconnect")) {
                    Text("Disconnect wallet", color = c.danger)
                }
            }
        }
        state.error?.let { InlineError(it, Modifier.padding(horizontal = Spacing.screen, vertical = Spacing.s)) }
        SectionFooter("Stamps and level badges live in this wallet. Disconnecting keeps them there.")
    }
}

private fun fmt(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else String.format(Locale.getDefault(), "%.2f", value)
