package com.larea.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.larea.app.feature.auth.SignInScreen
import com.larea.app.feature.auth.SignUpScreen
import com.larea.app.feature.chat.ChatScreen
import com.larea.app.feature.location.LocationPermissionScreen
import com.larea.app.feature.nearby.NearbyScreen
import com.larea.app.feature.settings.SettingsScreen
import com.larea.app.feature.settings.SuspendedScreen
import com.larea.app.feature.verification.VerificationScreen
import kotlinx.coroutines.flow.SharedFlow
import androidx.compose.runtime.DisposableEffect

object Routes {
    const val SIGN_IN = "signin"
    const val SIGN_UP = "signup"
    const val VERIFY = "verify"
    const val LOCATION = "location"
    const val NEARBY = "nearby"
    const val SETTINGS = "settings"
    const val SUSPENDED = "suspended"
    const val CHAT = "chat/{venueId}/{venueName}"
    fun chat(venueId: String, venueName: String) = "chat/$venueId/${java.net.URLEncoder.encode(venueName, "UTF-8")}"
}

@Composable
fun LareaApp(verificationReturns: SharedFlow<Unit>) {
    val root: RootViewModel = hiltViewModel()
    val state by root.state.collectAsStateWithLifecycle()
    val nav = rememberNavController()

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                root.refreshPermission()
                root.refreshMe()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Route to the right gate whenever the funnel state changes.
    LaunchedEffect(state::class) {
        val target = when (state) {
            AppState.Loading -> return@LaunchedEffect
            AppState.SignedOut -> Routes.SIGN_IN
            is AppState.NeedsVerification -> Routes.VERIFY
            is AppState.NeedsLocation -> Routes.LOCATION
            is AppState.Suspended -> Routes.SUSPENDED
            is AppState.Ready -> Routes.NEARBY
        }
        val current = nav.currentBackStackEntry?.destination?.route
        val staysInReadyArea = state is AppState.Ready && (current == Routes.SETTINGS || current == Routes.CHAT)
        if (current != target && !staysInReadyArea) {
            nav.navigate(target) { popUpTo(0) { inclusive = true }; launchSingleTop = true }
        }
    }

    if (state is AppState.Loading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    NavHost(navController = nav, startDestination = Routes.SIGN_IN) {
        composable(Routes.SIGN_IN) { SignInScreen(onCreateAccount = { nav.navigate(Routes.SIGN_UP) }) }
        composable(Routes.SIGN_UP) { SignUpScreen(onHaveAccount = { nav.popBackStack() }) }
        composable(Routes.VERIFY) { VerificationScreen(returns = verificationReturns, onVerified = { root.refreshMe() }) }
        composable(Routes.LOCATION) { LocationPermissionScreen(onGranted = { root.refreshPermission() }) }
        composable(Routes.SUSPENDED) { SuspendedScreen() }
        composable(Routes.NEARBY) {
            NearbyScreen(
                onOpenChat = { venueId, venueName -> nav.navigate(Routes.chat(venueId, venueName)) },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.SETTINGS) { SettingsScreen(onBack = { nav.popBackStack() }) }
        composable(
            Routes.CHAT,
            arguments = listOf(navArgument("venueId") { type = NavType.StringType }, navArgument("venueName") { type = NavType.StringType }),
        ) { entry ->
            val venueName = java.net.URLDecoder.decode(entry.arguments?.getString("venueName").orEmpty(), "UTF-8")
            ChatScreen(venueName = venueName, onLeft = { nav.popBackStack() })
        }
    }
}
