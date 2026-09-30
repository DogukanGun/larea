package com.larea.app.solana

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * What the Solana dApp Store build adds to the shared screens: wallet, check-in stamps, loyalty,
 * tips and USDC payments. The `play` flavor binds [NoSolanaUi], so shared code only ever calls this
 * interface and the Play build carries no Solana code at all.
 */
interface SolanaUi {
    val enabled: Boolean

    /** Called from MainActivity.onCreate: the wallet adapter must register for activity results there. */
    fun attach(activity: ComponentActivity) {}

    /** Wallet, stamps and levels on the Profile tab. */
    @Composable
    fun ProfileSection() {}
}

/** The Play build: no Solana features. */
object NoSolanaUi : SolanaUi {
    override val enabled = false
}

val LocalSolanaUi = staticCompositionLocalOf<SolanaUi> { NoSolanaUi }
