package com.larea.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.larea.app.core.DebugFlags
import com.larea.app.core.auth.SessionStore
import com.larea.app.ui.LareaApp
import com.larea.app.ui.navigation.AppRouter
import com.larea.app.ui.theme.LareaTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var router: AppRouter
    @Inject lateinit var sessions: SessionStore

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        DebugFlags.read(intent, BuildConfig.DEBUG)
        // UI tests launch with LareaResetState so a previous run's session never leaks in.
        if (savedInstanceState == null && DebugFlags.resetState) runBlocking { sessions.clear() }
        enableEdgeToEdge()
        if (savedInstanceState == null) router.handle(intent?.dataString)
        setContent {
            LareaTheme {
                LareaApp()
            }
        }
    }

    /** Stripe returns here: larea://market/order/<id>?checkout=… and larea://market/stripe/return. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        router.handle(intent.dataString)
    }
}
