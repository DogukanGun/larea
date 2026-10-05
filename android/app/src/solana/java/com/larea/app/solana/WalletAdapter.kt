package com.larea.app.solana

import android.net.Uri
import androidx.activity.ComponentActivity
import com.larea.app.Backend
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient
import com.solana.mobilewalletadapter.common.signin.SignInWithSolana
import java.lang.ref.WeakReference
import javax.inject.Inject
import javax.inject.Singleton

class WalletException(message: String) : Exception(message)

/**
 * Mobile Wallet Adapter: talks to whichever Solana wallet the phone has (the Seeker's Seed Vault,
 * Phantom, Solflare…). Larea never holds a key; the wallet signs.
 */
@Singleton
class WalletAdapter @Inject constructor() {
    // The identity must match the backend the app talks to: wallets check the Sign In With Solana
    // domain against it, and the backend signs its challenge with its own PUBLIC_URL host.
    private val adapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse(Backend.baseUrl.trimEnd('/')),
            iconUri = Uri.parse("favicon.ico"),
            identityName = "Larea",
        ),
    ).apply { blockchain = Solana.Devnet }

    private var sender: WeakReference<ActivityResultSender>? = null

    /** Must run in Activity.onCreate (the sender registers an activity-result launcher). */
    fun attach(activity: ComponentActivity) {
        sender = WeakReference(ActivityResultSender(activity))
    }

    fun useCluster(cluster: String) {
        adapter.blockchain = if (cluster == "mainnet") Solana.Mainnet else Solana.Devnet
    }

    private fun sender(): ActivityResultSender = sender?.get() ?: throw WalletException("The wallet can't be opened right now.")

    /** Sign In With Solana: the wallet signs our challenge and returns its address and signature. */
    suspend fun signIn(challenge: SiwsChallenge): MobileWalletAdapterClient.AuthorizationResult.SignInResult {
        val payload = SignInWithSolana.Payload(
            challenge.domain, null as String?, challenge.statement, Uri.parse(challenge.uri), challenge.version,
            challenge.chainId, challenge.nonce, challenge.issuedAt, null, null, null, null,
        )
        val result = adapter.signIn(sender(), payload)
        return when (result) {
            is TransactionResult.Success -> result.authResult.signInResult ?: throw WalletException("The wallet did not sign in.")
            is TransactionResult.NoWalletFound -> throw WalletException(NO_WALLET)
            is TransactionResult.Failure -> throw WalletException(describe(result.e))
        }
    }

    /** Signs transactions Larea's backend prepared; returns the signed bytes (the backend submits them). */
    suspend fun signTransactions(transactions: List<ByteArray>): List<ByteArray> {
        val result = adapter.transact(sender()) { signTransactions(transactions.toTypedArray()).signedPayloads.toList() }
        // The wallet's own answer, for when a signature never comes back (wrong network, declined, …).
        if (result !is TransactionResult.Success) android.util.Log.w("LareaWallet", "signTransactions: $result", (result as? TransactionResult.Failure)?.e)
        return when (result) {
            is TransactionResult.Success -> result.payload
            is TransactionResult.NoWalletFound -> throw WalletException(NO_WALLET)
            is TransactionResult.Failure -> throw WalletException(describe(result.e))
        }
    }

    /** Plain words for the wallet's failure, instead of an exception class name on screen. */
    private fun describe(e: Throwable): String = when {
        e is java.util.concurrent.TimeoutException || e.cause is java.util.concurrent.TimeoutException ->
            "The wallet didn't answer in time. Open it, approve the request, and try again."
        e is java.util.concurrent.CancellationException -> "The wallet request was cancelled."
        else -> e.message?.takeIf { it.isNotBlank() && !it.contains("Exception") } ?: "The wallet refused the request. Please try again."
    }

    fun forget() {
        adapter.authToken = null
    }

    companion object {
        const val NO_WALLET = "Install a Solana wallet (Phantom, Solflare or the Seeker's wallet) to continue."
    }
}
