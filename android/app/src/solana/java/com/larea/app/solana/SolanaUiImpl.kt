package com.larea.app.solana

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import com.larea.app.core.location.Fix
import javax.inject.Inject
import javax.inject.Singleton

/** The dApp Store build: wires the Solana screens into the shared app. */
@Singleton
class SolanaUiImpl @Inject constructor(
    private val adapter: WalletAdapter,
    private val stamps: StampFlow,
) : SolanaUi {
    override val enabled = true

    override fun attach(activity: ComponentActivity) = adapter.attach(activity)

    override suspend fun beforeJoin(venueId: String, fix: Fix, step: (String) -> Unit): Result<Unit> = stamps.ensureStamp(venueId, fix, step)

    @Composable
    override fun ProfileSection() = WalletSection()
}
