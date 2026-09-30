package com.larea.app.solana

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import com.larea.app.core.location.Fix
import com.larea.app.core.network.Author
import javax.inject.Inject
import javax.inject.Singleton

/** The dApp Store build: wires the Solana screens into the shared app. */
@Singleton
class SolanaUiImpl @Inject constructor(
    private val adapter: WalletAdapter,
    private val stamps: StampFlow,
    private val orders: OrderPayFlow,
) : SolanaUi {
    override val enabled = true

    override fun attach(activity: ComponentActivity) = adapter.attach(activity)

    override suspend fun payOrder(orderId: String, step: (String) -> Unit): Result<Unit> = orders.pay(orderId, step)

    override suspend fun beforeJoin(venueId: String, fix: Fix, step: (String) -> Unit): Result<Unit> = stamps.ensureStamp(venueId, fix, step)

    @Composable
    override fun AuthorBadge(level: Int) = LevelBadge(level)

    @Composable
    override fun RoomSwitch(venueId: String, room: String, onRoom: (String) -> Unit) = RoomSwitchBar(venueId, room, onRoom)

    @Composable
    override fun TipDialog(venueId: String, recipient: Author, onDismiss: () -> Unit) = TipDialogContent(venueId, recipient, onDismiss)

    @Composable
    override fun ProfileSection() = WalletSection()
}
