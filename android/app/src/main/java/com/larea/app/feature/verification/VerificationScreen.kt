package com.larea.app.feature.verification

import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.R
import com.larea.app.ui.components.ErrorText
import com.larea.app.ui.components.ScreenColumn
import kotlinx.coroutines.flow.SharedFlow

@Composable
fun VerificationScreen(returns: SharedFlow<Unit>, onVerified: () -> Unit, viewModel: VerificationViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(state.launchUrl) {
        val url = state.launchUrl ?: return@LaunchedEffect
        CustomTabsIntent.Builder().build().launchUrl(context, url.toUri())
        viewModel.consumedLaunchUrl()
    }
    LaunchedEffect(Unit) { returns.collect { viewModel.startPolling() } }
    LaunchedEffect(state.status?.verified) { if (state.status?.verified == true) onVerified() }

    val status = state.status
    ScreenColumn(title = stringResource(R.string.verify_title), subtitle = stringResource(R.string.verify_body)) {
        when {
            status?.pending == true -> {
                CircularProgressIndicator()
                Text(stringResource(R.string.verify_pending), style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { viewModel.refreshStatus() }) { Text(stringResource(R.string.verify_check_again)) }
                TextButton(onClick = { viewModel.start() }) { Text(stringResource(R.string.verify_start)) }
            }
            else -> {
                if (status?.lastOutcome == "FAILED") Text(stringResource(R.string.verify_failed), color = MaterialTheme.colorScheme.error)
                if (status?.lastOutcome == "RESUBMIT") Text(stringResource(R.string.verify_resubmit))
                val retry = status?.retryAfterSec
                if (retry != null && retry > 0) Text(stringResource(R.string.verify_retry_in, "${(retry + 59) / 60} min"))
                ErrorText(state.error)
                Button(onClick = { viewModel.start() }, enabled = !state.busy && (retry == null || retry <= 0), modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.verify_start))
                }
            }
        }
    }
}
