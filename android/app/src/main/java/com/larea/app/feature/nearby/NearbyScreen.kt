package com.larea.app.feature.nearby

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.R
import com.larea.app.core.network.NearbyVenue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyScreen(onOpenChat: (String, String) -> Unit, onOpenSettings: () -> Unit, viewModel: NearbyViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    DisposableEffect(Unit) {
        viewModel.start()
        onDispose { viewModel.stop() }
    }
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is NearbyEvent.Joined -> onOpenChat(event.venueId, event.venueName)
                is NearbyEvent.Message -> snackbar.showSnackbar(event.text)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.nearby_title)) },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) { Icon(Icons.Default.Refresh, contentDescription = null) }
                    IconButton(onClick = onOpenSettings) { Icon(Icons.Default.Settings, contentDescription = stringResource(R.string.settings_title)) }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.locating -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Text(stringResource(R.string.nearby_locating), modifier = Modifier.padding(top = 12.dp))
                }
                state.error != null && state.venues.isEmpty() -> Text(state.error!!, modifier = Modifier.align(Alignment.Center).padding(24.dp), color = MaterialTheme.colorScheme.error)
                state.venues.isEmpty() && !state.loading -> Text(stringResource(R.string.nearby_empty), modifier = Modifier.align(Alignment.Center).padding(24.dp))
                else -> LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(state.venues, key = { it.id }) { venue -> VenueCard(venue, joining = state.joining == venue.id, onClick = { viewModel.join(venue) }) }
                }
            }
        }
    }
}

@Composable
private fun VenueCard(venue: NearbyVenue, joining: Boolean, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(enabled = !joining, onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(venue.name, style = MaterialTheme.typography.titleMedium)
                Text(venue.label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.nearby_members, venue.memberCount), style = MaterialTheme.typography.bodySmall)
            }
            if (joining) CircularProgressIndicator(modifier = Modifier.padding(start = 8.dp))
            else if (venue.eligible) AssistChip(onClick = onClick, label = { Text(stringResource(R.string.nearby_badge)) })
        }
    }
}
