package com.larea.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.larea.app.core.DebugFlags
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import kotlin.random.Random

/**
 * The dApp Store build without a wallet app: Profile offers "Connect wallet", the place card says
 * "Check in & join", and checking in without a linked wallet explains what to do instead of joining.
 * Runs against a local backend with NODE_ENV=test and SOLANA_ENABLED=1:
 * `./gradlew :app:connectedSolanaDebugAndroidTest -Plarea.devHost=10.0.2.2:3001`.
 * With Solana Mobile's fakewallet installed the wallet steps can be exercised by hand from here.
 */
class SolanaFlowTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val permissions: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val locations = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var feeding: Thread? = null
    private var scenario: ActivityScenario<MainActivity>? = null

    // The Berlin library LareaFlowTest uses.
    private val lat = 52.5316059
    private val lng = 13.3986959

    private fun fused() = if (Build.VERSION.SDK_INT >= 31) LocationManager.FUSED_PROVIDER else LocationManager.NETWORK_PROVIDER

    @Before
    fun setUp() {
        shell("settings put secure autofill_service null")
        shell("appops set ${context.packageName} android:mock_location allow")
        val providers = listOf(LocationManager.GPS_PROVIDER, fused())
        providers.forEach { name ->
            runCatching { locations.removeTestProvider(name) }
            locations.addTestProvider(name, false, false, false, false, true, true, true, 1, Criteria.ACCURACY_FINE)
            locations.setTestProviderEnabled(name, true)
        }
        feeding = Thread {
            while (!Thread.currentThread().isInterrupted) {
                providers.forEach { name ->
                    val fix = Location(name).apply {
                        latitude = lat; longitude = lng; accuracy = 8f; altitude = 40.0
                        time = System.currentTimeMillis(); elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                    }
                    runCatching { locations.setTestProviderLocation(name, fix) }
                }
                try { Thread.sleep(1_000) } catch (_: InterruptedException) { return@Thread }
            }
        }.apply { isDaemon = true; start() }
    }

    @After
    fun tearDown() {
        feeding?.interrupt()
        scenario?.close()
        listOf(LocationManager.GPS_PROVIDER, fused()).forEach { runCatching { locations.removeTestProvider(it) } }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { fd -> java.io.FileInputStream(fd.fileDescriptor).use { it.readBytes() } }
    }

    private fun waitFor(matcher: SemanticsMatcher, timeoutMs: Long = 15_000) {
        compose.waitUntil(timeoutMs) { compose.onAllNodes(matcher, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun tap(tag: String, timeoutMs: Long = 15_000) {
        waitFor(hasTestTag(tag), timeoutMs)
        compose.onAllNodes(hasTestTag(tag), useUnmergedTree = true).onFirst().performClick()
        compose.waitForIdle()
    }

    private fun type(tag: String, text: String) {
        waitFor(hasTestTag(tag))
        compose.onAllNodes(hasTestTag(tag), useUnmergedTree = true).onFirst().performTextInput(text)
    }

    private fun tagPrefix(prefix: String, except: String? = null) = SemanticsMatcher("test tag starts with $prefix") { node ->
        val tag = node.config.getOrNull(SemanticsProperties.TestTag)
        tag != null && tag.startsWith(prefix) && tag != except
    }

    @Test
    fun walletSectionAndCheckInNeedAWallet() {
        DebugFlags.set(testAgePass = true, testSeedImage = false)
        val intent = Intent(context, MainActivity::class.java).putExtra("LareaTestAgePass", true).putExtra("LareaResetState", true)
        scenario = ActivityScenario.launch(intent)

        tap("welcome.create")
        val suffix = Random.nextInt(1000, 9999)
        type("signup.displayName", "sol_$suffix")
        type("signup.email", "sol-$suffix@example.test")
        type("signup.password", "correct-horse-battery")
        tap("signup.submit")
        tap("verify.start", timeoutMs = 30_000)

        tap("tab.profile", timeoutMs = 30_000)
        waitFor(hasTestTag("solana.wallet.connect"), timeoutMs = 20_000)

        tap("tab.nearby")
        waitFor(hasTestTag("nearby.root"))
        Thread.sleep(3_000)
        compose.onAllNodes(hasContentDescription("Show my location"), useUnmergedTree = true).onFirst().performClick()
        val venueRow = tagPrefix("venue.", except = "venue.card.join") and hasAnyDescendant(hasText("Nearby"))
        waitFor(venueRow, timeoutMs = 150_000)
        compose.onAllNodes(venueRow, useUnmergedTree = true).onFirst().performClick()
        waitFor(hasText("Check in & join"))
        tap("venue.card.join")
        // No wallet yet: the backend answers WALLET_REQUIRED and nothing is joined.
        waitFor(hasText("Connect a wallet in your profile to collect stamps.", substring = true), timeoutMs = 20_000)
    }
}
