package com.larea.app.core

import android.content.Intent

/**
 * Debug-only launch switches for the UI flow test (the counterpart of the iOS `-Larea…` launch arguments).
 * Release builds ignore them.
 */
object DebugFlags {
    /** Age check passes through the backend's test-only shortcut (backend must run with NODE_ENV=test). */
    @Volatile var testAgePass = false
        private set

    /** Offers "Use test image" in photo pickers. */
    @Volatile var testSeedImage = false
        private set

    /** Sign out on launch. */
    @Volatile var resetState = false
        private set

    fun read(intent: Intent?, debug: Boolean) {
        if (!debug || intent == null) return
        testAgePass = testAgePass || intent.getBooleanExtra("LareaTestAgePass", false)
        testSeedImage = testSeedImage || intent.getBooleanExtra("LareaTestSeedImage", false)
        resetState = intent.getBooleanExtra("LareaResetState", false)
    }

    /** For instrumented tests that start the activity themselves. */
    fun set(testAgePass: Boolean = this.testAgePass, testSeedImage: Boolean = this.testSeedImage) {
        this.testAgePass = testAgePass
        this.testSeedImage = testSeedImage
    }
}
