package com.larea.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
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
import java.io.File
import java.io.FileOutputStream
import kotlin.random.Random

/**
 * Walks onboarding, the marketplace and the chat against a local backend running with NODE_ENV=test
 * (age check via the test-only shortcut, mock locations allowed) and saves a screenshot of every
 * screen: the Android port of ios/LareaUITests/LareaFlowUITests.swift.
 *
 * Build against the local backend with -Plarea.devHost=10.0.2.2:<port>. Screenshots land in the
 * app's external files dir under flow/ (pull them with `adb pull`).
 */
class LareaFlowTest {
    @get:Rule val compose = createEmptyComposeRule()
    @get:Rule val permissions: GrantPermissionRule = GrantPermissionRule.grant(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val locations = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var feeding: Thread? = null
    private var scenario: ActivityScenario<MainActivity>? = null

    // A real library in Berlin (the same spot the iOS test parks the simulator on).
    private val lat = 52.5316059
    private val lng = 13.3986959

    @Before
    fun setUp() {
        // The password manager's save sheet covers the screen; the test has no use for it.
        shell("settings put secure autofill_service null")
        shell("appops set ${context.packageName} android:mock_location allow")
        feedLocation()
    }

    @After
    fun tearDown() {
        feeding?.interrupt()
        scenario?.close()
        listOf(LocationManager.GPS_PROVIDER, fused()).forEach { runCatching { locations.removeTestProvider(it) } }
    }

    /** Runs a shell command and waits for it to finish (the descriptor closes when it exits). */
    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { fd ->
            java.io.FileInputStream(fd.fileDescriptor).use { it.readBytes() }
        }
    }

    private fun fused() = if (Build.VERSION.SDK_INT >= 31) LocationManager.FUSED_PROVIDER else LocationManager.NETWORK_PROVIDER

    /** Keeps a precise fix coming through test providers (the dev backend accepts mocked fixes). */
    private fun feedLocation() {
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

    private fun tagPrefix(prefix: String, except: String? = null) = SemanticsMatcher("test tag starts with $prefix") { node ->
        val tag = node.config.getOrNull(SemanticsProperties.TestTag)
        tag != null && tag.startsWith(prefix) && tag != except
    }

    private fun waitFor(matcher: SemanticsMatcher, timeoutMs: Long = 15_000, message: String = matcher.description) {
        try {
            compose.waitUntil(timeoutMs) { compose.onAllNodes(matcher, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        } catch (e: ComposeTimeoutException) {
            snapshot("failure")
            throw AssertionError("timed out: $message", e)
        }
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

    private fun waitForText(text: String, timeoutMs: Long = 15_000, substring: Boolean = false) = waitFor(hasText(text, substring = substring), timeoutMs, "text \"$text\"")

    private var shots = 0

    private fun snapshot(name: String) {
        compose.waitForIdle()
        val dir = File(context.getExternalFilesDir(null), "flow").apply { mkdirs() }
        val bitmap = instrumentation.uiAutomation.takeScreenshot() ?: return
        FileOutputStream(File(dir, "%02d-%s.png".format(++shots, name))).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test
    fun signUpVerifyPostJoinAndChat() {
        DebugFlags.set(testAgePass = true, testSeedImage = true)
        val intent = Intent(context, MainActivity::class.java)
            .putExtra("LareaTestAgePass", true)
            .putExtra("LareaTestSeedImage", true)
            .putExtra("LareaResetState", true)
        scenario = ActivityScenario.launch(intent)

        waitFor(hasTestTag("welcome.create"))
        snapshot("welcome")
        tap("welcome.create")

        val suffix = Random.nextInt(1000, 9999)
        val name = "ui_$suffix"
        type("signup.displayName", name)
        type("signup.email", "ui-$suffix@example.test")
        // Validation errors appear only after a first submit attempt.
        tap("signup.submit")
        waitForText("Choose a password.")
        snapshot("signup-validation")
        type("signup.password", "correct-horse-battery")
        snapshot("signup-filled")
        tap("signup.submit")

        waitForText("Confirm you're 18 or older")
        snapshot("verification")
        tap("verify.start")

        // Marketplace: post a listing with a seeded photo, then edit it.
        tap("tab.market", timeoutMs = 30_000)
        waitFor(hasTestTag("market.create"))
        Thread.sleep(2_000)
        snapshot("market")
        tap("market.create")
        tap("market.create.photos")
        tap("market.create.seedPhoto")
        waitFor(hasContentDescription("Remove photo"), message = "the photo was not added")
        type("market.create.title", "UI test desk lamp")
        type("market.create.price", "12")
        snapshot("market-create")
        tap("market.submit")
        waitForText("UI test desk lamp", timeoutMs = 30_000)
        waitFor(hasTestTag("market.listing.menu"), timeoutMs = 30_000)
        snapshot("market-listing")

        tap("market.listing.menu")
        waitForText("Edit listing")
        compose.onAllNodes(hasText("Edit listing"), useUnmergedTree = true).onFirst().performClick()
        waitFor(hasTestTag("market.create.title"))
        waitFor(hasText("UI test desk lamp"), message = "the edit form is not pre-filled")
        compose.onAllNodes(hasTestTag("market.create.title"), useUnmergedTree = true).onFirst().performTextClearance()
        type("market.create.title", "UI test desk lamp v2")
        snapshot("market-edit")
        tap("market.submit")
        waitForText("UI test desk lamp v2", timeoutMs = 30_000)
        snapshot("market-edited")

        // The panel lists places nearest first; join the first one we are close enough to ("Nearby").
        tap("tab.nearby")
        waitFor(hasTestTag("nearby.root"))
        // Zoom in on the user like a person would: cafés only show up in a close view.
        Thread.sleep(3_000)
        compose.onAllNodes(hasContentDescription("Show my location"), useUnmergedTree = true).onFirst().performClick()
        val venueRow = tagPrefix("venue.", except = "venue.card.join") and hasAnyDescendant(hasText("Nearby"))
        waitFor(venueRow, timeoutMs = 150_000, message = "the place list did not load")
        Thread.sleep(1_000)
        snapshot("map-list")
        compose.onAllNodes(venueRow, useUnmergedTree = true).onFirst().performClick()
        waitFor(hasTestTag("venue.card.join"), message = "the place card did not open")
        snapshot("map-card")
        tap("venue.card.join")

        waitFor(hasTestTag("chat.composer"), timeoutMs = 20_000, message = "chat did not open")
        Thread.sleep(1_500)
        snapshot("chat-empty")
        type("chat.composer", "Anyone want to get food?")
        tap("chat.send")
        waitForText("Anyone want to get food?")

        // A photo message from the debug test image.
        tap("chat.attach")
        tap("chat.attach.seed")
        waitFor(hasTestTag("chat.attach.preview"))
        tap("chat.send")
        waitFor(tagPrefix("chat.image."), timeoutMs = 30_000, message = "the photo message did not appear")
        snapshot("chat-photo")

        // A poll: create it from the attachment menu, then vote.
        tap("chat.attach")
        tap("chat.poll")
        type("poll.question", "Pizza or ramen tonight?")
        type("poll.option.0", "Pizza")
        type("poll.option.1", "Ramen")
        tap("poll.submit")
        waitForText("Pizza or ramen tonight?", timeoutMs = 20_000)
        compose.onAllNodes(hasText("Ramen"), useUnmergedTree = true).onFirst().performClick()
        waitForText("100%", timeoutMs = 15_000)
        snapshot("chat-poll")

        // Moderation: mild profanity is masked, a threat is blocked.
        type("chat.composer", "this is damn good")
        tap("chat.send")
        waitForText("this is d*** good", timeoutMs = 20_000, substring = true)
        type("chat.composer", "I know where you live. I'm coming to your house.")
        tap("chat.send")
        waitForText("This message doesn't meet our community guidelines.", timeoutMs = 20_000, substring = true)
        snapshot("chat-moderation")

        tap("chat.members")
        waitForText(name)
        snapshot("members")
        tap("members.done")
        tap("chat.leave")
        waitFor(hasTestTag("nearby.root"))

        // Profile, payouts and the listing posted above.
        tap("tab.profile")
        waitForText(name)
        snapshot("profile")
        if (compose.onAllNodes(hasTestTag("profile.payouts"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()) {
            tap("profile.payouts")
            waitFor(hasTestTag("market.stripe.setup"))
            snapshot("payouts")
            compose.onAllNodes(hasContentDescription("Back"), useUnmergedTree = true).onFirst().performClick()
        }
        tap("profile.listings")
        waitFor(tagPrefix("profile.listing."), message = "my listing is missing")
        snapshot("my-listings")
    }

    private fun hasContentDescription(text: String) = androidx.compose.ui.test.hasContentDescription(text)
}
