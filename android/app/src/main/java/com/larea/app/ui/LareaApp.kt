package com.larea.app.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.feature.auth.AuthFlow
import com.larea.app.feature.location.LocationPermissionScreen
import com.larea.app.feature.suspended.SuspendedScreen
import com.larea.app.feature.verification.VerificationScreen
import com.larea.app.ui.theme.Larea

/** Picks the screen from the onboarding state and fades between them (iOS `RootView`). */
@Composable
fun LareaApp(root: RootViewModel = hiltViewModel()) {
    val state by root.state.collectAsStateWithLifecycle()
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

    Box(Modifier.fillMaxSize().background(Larea.colors.background).semantics { testTagsAsResourceId = true }) {
        Crossfade(targetState = state::class, animationSpec = tween(250), label = "gate") { kind ->
            when (kind) {
                AppState.Loading::class -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Larea.colors.brandPrimary) }
                AppState.SignedOut::class -> AuthFlow()
                AppState.NeedsVerification::class -> VerificationScreen()
                AppState.NeedsLocation::class -> LocationPermissionScreen(
                    permission = (state as? AppState.NeedsLocation)?.permission ?: com.larea.app.core.location.LocationPermission.Denied,
                    onChanged = root::refreshPermission,
                )
                AppState.Suspended::class -> SuspendedScreen(onSignOut = root::signOut)
                else -> MainScaffold(root)
            }
        }
    }
}
