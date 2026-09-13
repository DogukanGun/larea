package com.larea.app.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.R
import com.larea.app.ui.components.ScreenColumn

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var name by rememberSaveable(state.me?.displayName) { mutableStateOf(state.me?.displayName.orEmpty()) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(state.message) {
        val m = state.message ?: return@LaunchedEffect
        snackbar.showSnackbar(m)
        viewModel.clearMessage()
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.settings_delete)) },
            text = { Text(stringResource(R.string.settings_delete_confirm)) },
            confirmButton = { TextButton(onClick = { confirmDelete = false; viewModel.deleteAccount() }) { Text(stringResource(R.string.settings_delete)) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.common_cancel)) } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) } },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(state.me?.email.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text(stringResource(R.string.settings_display_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { viewModel.saveDisplayName(name) }, enabled = !state.busy && name.trim() != state.me?.displayName && name.trim().length >= 3) {
                Text(stringResource(R.string.settings_save))
            }
            HorizontalDivider()
            Text(stringResource(R.string.settings_blocked), style = MaterialTheme.typography.titleMedium)
            if (state.blocks.isEmpty()) Text(stringResource(R.string.settings_no_blocked), color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.blocks.forEach { b ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(b.displayName, modifier = Modifier.weight(1f))
                    TextButton(onClick = { viewModel.unblock(b.id) }, enabled = !state.busy) { Text(stringResource(R.string.settings_unblock)) }
                }
            }
            HorizontalDivider()
            OutlinedButton(onClick = { viewModel.signOut() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.settings_sign_out)) }
            TextButton(onClick = { confirmDelete = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.settings_delete), color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
fun SuspendedScreen(viewModel: SettingsViewModel = hiltViewModel()) {
    ScreenColumn(title = stringResource(R.string.settings_suspended)) {
        OutlinedButton(onClick = { viewModel.signOut() }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.settings_sign_out)) }
    }
}
