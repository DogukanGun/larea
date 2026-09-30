package com.larea.app.solana

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import com.larea.app.core.location.Fix
import com.larea.app.core.network.Author

/**
 * What the Solana dApp Store build adds to the shared screens: wallet, check-in stamps, loyalty,
 * tips and USDC payments. The `play` flavor binds [NoSolanaUi], so shared code only ever calls this
 * interface and the Play build carries no Solana code at all.
 */
interface SolanaUi {
    val enabled: Boolean

    /** Called from MainActivity.onCreate: the wallet adapter must register for activity results there. */
    fun attach(activity: ComponentActivity) {}

    /**
     * Runs before joining a place's chat. The Solana build makes sure there is a stamp from the last
     * 24 h, checking in through the wallet when needed, and reports each step for the join button.
     */
    suspend fun beforeJoin(venueId: String, fix: Fix, step: (String) -> Unit): Result<Unit> = Result.success(Unit)

    /** A loyalty badge next to an author's name in chat (level 1 Visitor … 4 Legend). */
    @Composable
    fun AuthorBadge(level: Int) {}

    /** Under the chat's top bar: switch between the main chat and the place's Regulars room. */
    @Composable
    fun RoomSwitch(venueId: String, room: String, onRoom: (String) -> Unit) {}

    /** Tip someone in the chat in USDC or SKR (their long-press menu offers it when [enabled]). */
    @Composable
    fun TipDialog(venueId: String, recipient: Author, onDismiss: () -> Unit) {}

    /** Pays a USDC deal from the wallet into Larea's escrow, reporting each step. */
    suspend fun payOrder(orderId: String, step: (String) -> Unit): Result<Unit> =
        Result.failure(IllegalStateException("This deal is paid in USDC. Pay for it in the Larea app from the Solana dApp Store."))

    /** Wallet, stamps and levels on the Profile tab. */
    @Composable
    fun ProfileSection() {}
}

/** The Play build: no Solana features. */
object NoSolanaUi : SolanaUi {
    override val enabled = false
}

val LocalSolanaUi = staticCompositionLocalOf<SolanaUi> { NoSolanaUi }
