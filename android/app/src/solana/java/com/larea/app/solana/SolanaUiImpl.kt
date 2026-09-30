package com.larea.app.solana

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import javax.inject.Inject
import javax.inject.Singleton

/** The dApp Store build: wires the Solana screens into the shared app. */
@Singleton
class SolanaUiImpl @Inject constructor(private val adapter: WalletAdapter) : SolanaUi {
    override val enabled = true

    override fun attach(activity: ComponentActivity) = adapter.attach(activity)

    @Composable
    override fun ProfileSection() = WalletSection()
}
