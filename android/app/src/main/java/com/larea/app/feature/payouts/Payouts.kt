package com.larea.app.feature.payouts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Euro
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.browser.InAppBrowser
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.StripeAccountStatus
import com.larea.app.core.network.StripeStatus
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.ui.components.HeroGlyph
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.OnResume
import com.larea.app.ui.components.Pill
import com.larea.app.ui.components.PillStyle
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.SecondaryButton
import com.larea.app.ui.components.StepRow
import com.larea.app.ui.navigation.AppRouter
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PayoutsState(val status: StripeAccountStatus = StripeAccountStatus(), val loaded: Boolean = false, val busy: Boolean = false, val error: String? = null)

@HiltViewModel
class PayoutsViewModel @Inject constructor(private val api: LareaApi, val router: AppRouter) : ViewModel() {
    private val _state = MutableStateFlow(PayoutsState())
    val state: StateFlow<PayoutsState> = _state

    init {
        refresh()
    }

    fun refresh(force: Boolean = false) {
        viewModelScope.launch {
            apiCall { api.stripeAccount(if (force) 1 else null) }
                .onSuccess { status -> _state.update { it.copy(status = status, error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(loaded = true) }
        }
    }

    /** A fresh onboarding link from Stripe, opened in a Custom Tab. */
    fun startOnboarding(open: (String) -> Unit) {
        if (_state.value.busy) return
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            apiCall { api.stripeAccountLink() }
                .onSuccess { open(it.url) }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(busy = false) }
        }
    }
}

/** Explains payouts and opens Stripe's Express onboarding (iOS `StripeOnboardingView`). */
@Composable
fun PayoutsContent(onReady: (() -> Unit)? = null, model: PayoutsViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val stripeReturns by model.router.stripeReturns.collectAsStateWithLifecycle()
    val c = Larea.colors
    val context = LocalContext.current
    val open: (String) -> Unit = { url -> InAppBrowser.open(context, url, c.brandPrimary) }

    // Coming back from the Custom Tab or through larea://market/stripe/return: ask Stripe again.
    OnResume { model.refresh(force = true) }
    LaunchedEffect(stripeReturns) { if (stripeReturns > 0) model.refresh(force = true) }
    LaunchedEffect(state.status.payoutsEnabled) { if (state.status.payoutsEnabled) onReady?.invoke() }

    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.l),
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = Spacing.screen).padding(bottom = Spacing.xxl),
    ) {
        HeroGlyph(Icons.Filled.Euro, Modifier.align(Alignment.CenterHorizontally).padding(top = Spacing.l))
        Text("Get paid for what you sell", style = LareaType.title, color = c.text)
        Text("Larea holds the buyer's money and pays you out after the handover. Payouts run through Stripe.", style = LareaType.body, color = c.secondaryText)
        StepRow(1, "Set up payouts with Stripe", "Takes a few minutes: your name, address and the bank account to pay into.")
        StepRow(2, "Buyers pay inside Larea", "The money is held safely until you meet.")
        StepRow(3, "Enter the buyer's code at the handover", "That releases the payout to your account.")
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().background(c.card, RoundedCornerShape(Radius.card)).padding(Spacing.m),
        ) {
            Text("Status", style = LareaType.headline, color = c.text, modifier = Modifier.weight(1f))
            if (state.loaded) {
                val status = state.status.status
                Pill(
                    status.label,
                    style = when (status) {
                        StripeStatus.READY -> PillStyle.Success
                        StripeStatus.PENDING -> PillStyle.Sunny
                        StripeStatus.NOT_SET_UP -> PillStyle.Neutral
                    },
                    icon = if (status == StripeStatus.READY) Icons.Filled.Verified else null,
                    modifier = Modifier.testTag("market.stripe.status"),
                )
            } else {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp), color = c.secondaryText)
            }
        }
        if (state.status.status == StripeStatus.PENDING && state.status.requirementsDue.isNotEmpty()) {
            NoteCard(Icons.Filled.Error, "Stripe still needs a few details. Continue the setup to finish.")
        }
        state.error?.let { InlineError(it) }
        if (state.status.status != StripeStatus.READY) {
            PrimaryButton(
                if (state.status.status == StripeStatus.NOT_SET_UP) "Set up payouts" else "Continue setup",
                onClick = { model.startOnboarding(open) },
                loading = state.busy,
                tag = "market.stripe.setup",
            )
        } else {
            NoteCard(Icons.Filled.Verified, "You're all set. Payouts arrive in the bank account you gave Stripe.")
            SecondaryButton("Update payout details", onClick = { model.startOnboarding(open) }, tag = "market.stripe.update")
        }
    }
}

@Composable
fun PayoutsScreen(onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Larea.colors.background)) {
        LareaTopBar("Payouts", onBack = onBack, background = Larea.colors.background)
        PayoutsContent()
    }
}
