package com.larea.app.feature.pins

import android.app.Activity
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LocationFixBody
import com.larea.app.core.network.MessagePin
import com.larea.app.core.network.PinQuote
import com.larea.app.core.network.PinQuoteRequest
import com.larea.app.core.network.PinTier
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

const val PIN_MAX_LENGTH = 500

val PinTier.icon: ImageVector
    get() = when (this) {
        PinTier.NEARBY -> Icons.Filled.MyLocation
        PinTier.CITY -> Icons.Filled.LocationCity
        PinTier.COUNTRY -> Icons.Filled.Flag
        PinTier.WORLD -> Icons.Filled.Public
    }

data class PinComposerState(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val text: String = "",
    val quote: PinQuote? = null,
    /** The text the quote was made for: editing it afterwards needs a new quote (it is moderated again). */
    val quotedText: String? = null,
    val price: String? = null,
    val quoting: Boolean = false,
    val buying: Boolean = false,
    val step: String? = null,
    val error: String? = null,
    val pending: String? = null,
) {
    val trimmed: String get() = text.trim()
    val currentQuote: PinQuote? get() = quote?.takeIf { quotedText == trimmed }
    val canQuote: Boolean get() = trimmed.isNotEmpty() && trimmed.length <= PIN_MAX_LENGTH && !quoting && !buying
}

/** Write a message, see what pinning it at a spot costs from where you are, and buy it. */
@HiltViewModel
class PinComposerViewModel @Inject constructor(
    private val api: LareaApi,
    private val location: LocationSource,
    private val payments: PinPayments,
) : ViewModel() {
    private val _state = MutableStateFlow(PinComposerState())
    val state: StateFlow<PinComposerState> = _state

    fun begin(lat: Double, lng: Double) {
        _state.value = PinComposerState(lat = lat, lng = lng)
    }

    fun setText(text: String) = _state.update { it.copy(text = text, error = null) }

    fun quote() {
        val s = _state.value
        if (!s.canQuote) return
        viewModelScope.launch {
            val fix = location.latest.value ?: location.awaitFix()
            if (fix == null) {
                _state.update { it.copy(error = "We need your location to price this pin. Please try again in a moment.") }
                return@launch
            }
            _state.update { it.copy(quoting = true, error = null) }
            val body = PinQuoteRequest(s.lat, s.lng, s.trimmed, LocationFixBody(fix.lat, fix.lng, fix.accuracyM, fix.mocked))
            apiCall { api.quotePin(body) }
                .onSuccess { quote ->
                    val price = payments.priceLabel(quote)
                    _state.update { it.copy(quote = quote, quotedText = s.trimmed, price = price ?: "$${quote.priceUsd}") }
                }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(quoting = false) }
        }
    }

    /** Pays for the quoted pin; calls [onPinned] once it is live. */
    fun buy(activity: Activity, onPinned: (MessagePin) -> Unit) {
        val quote = _state.value.currentQuote ?: return
        if (_state.value.buying) return
        viewModelScope.launch {
            _state.update { it.copy(buying = true, error = null) }
            payments.pay(activity, quote) { step -> _state.update { it.copy(step = step) } }
                .onSuccess { outcome ->
                    when (outcome) {
                        is PinPaymentOutcome.Activated -> onPinned(outcome.pin)
                        is PinPaymentOutcome.Pending -> _state.update { it.copy(pending = outcome.message) }
                        PinPaymentOutcome.Cancelled -> Unit
                    }
                }
                .onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(buying = false, step = null) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinComposerSheet(model: PinComposerViewModel, onDismiss: () -> Unit, onPinned: (MessagePin) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val activity = LocalActivity.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    fun close(then: () -> Unit = {}) {
        scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss(); then() }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = c.grouped) {
        Column(
            verticalArrangement = Arrangement.spacedBy(Spacing.l),
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.screen)
                .padding(bottom = Spacing.xl)
                .navigationBarsPadding(),
        ) {
            Text("Pin a message", style = LareaType.title3, color = c.text)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = state.text,
                    onValueChange = model::setText,
                    placeholder = { Text("What do you want to tell people here?") },
                    minLines = 3,
                    maxLines = 8,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = c.card, unfocusedContainerColor = c.card),
                    modifier = Modifier.fillMaxWidth().testTag("pin.composer.text"),
                )
                Text(
                    "${state.text.length}/$PIN_MAX_LENGTH",
                    style = LareaType.caption2,
                    color = if (state.text.length > PIN_MAX_LENGTH) c.danger else c.secondaryText,
                    modifier = Modifier.align(Alignment.End),
                )
            }

            val quote = state.currentQuote
            if (quote != null) {
                QuoteCard(quote, state.price ?: "$${quote.priceUsd}")
                quote.notice?.let { NoteCard(Icons.AutoMirrored.Filled.Chat, it) }
                PrimaryButton(
                    title = state.step ?: "Pin for ${state.price ?: "$${quote.priceUsd}"}",
                    onClick = { activity?.let { a -> model.buy(a) { pin -> close { onPinned(pin) } } } },
                    loading = state.buying && state.step == null,
                    enabled = !state.buying,
                    tag = "pin.composer.buy",
                )
                Text(
                    "One-time purchase. Your message and its chat stay on the map for ${quote.durationText}. You run the chat: hide messages, remove people and edit your message.",
                    style = LareaType.caption,
                    color = c.secondaryText,
                )
            } else {
                PrimaryButton(title = "See price", onClick = model::quote, loading = state.quoting, enabled = state.canQuote, tag = "pin.composer.quote")
                PriceGuide()
            }
            state.error?.let { InlineError(it) }
            state.pending?.let { NoteCard(Icons.Filled.MyLocation, it) }
        }
    }
}

@Composable
private fun QuoteCard(quote: PinQuote, price: String) {
    val c = Larea.colors
    val tier = quote.pinTier
    val where = quote.targetCity?.let { "In $it" } ?: when (tier) {
        PinTier.NEARBY -> "Within 1 km of you"
        PinTier.CITY -> "Same city"
        PinTier.COUNTRY -> "Same country"
        PinTier.WORLD -> "Another country"
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.m),
        modifier = Modifier
            .fillMaxWidth()
            .background(c.card, RoundedCornerShape(20.dp))
            .padding(Spacing.l)
            .testTag("pin.composer.quote.${tier.raw}"),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(48.dp).background(c.brandPrimary, CircleShape)) {
            Icon(tier.icon, contentDescription = null, tint = Color.White)
        }
        Column(Modifier.weight(1f)) {
            Text(tier.title, style = LareaType.headline, color = c.text)
            Text("$where · ${quote.durationText}", style = LareaType.subheadline, color = c.secondaryText)
        }
        Text(price, style = LareaType.title3, color = c.text)
    }
}

@Composable
private fun PriceGuide() {
    val c = Larea.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(Spacing.s),
        modifier = Modifier.fillMaxWidth().background(c.card, RoundedCornerShape(20.dp)).padding(Spacing.l),
    ) {
        listOf(
            Triple(PinTier.NEARBY, "$3.99", "24 hours"),
            Triple(PinTier.CITY, "$10.99", "3 days"),
            Triple(PinTier.COUNTRY, "$29.99", "3 days"),
            Triple(PinTier.WORLD, "$39.99", "7 days"),
        ).forEach { (tier, price, duration) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                Icon(tier.icon, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(18.dp))
                Text(tier.title, style = LareaType.subheadline, color = c.text)
                Spacer(Modifier.weight(1f))
                Text("$price · $duration", style = LareaType.subheadline, color = c.secondaryText)
            }
        }
    }
}
