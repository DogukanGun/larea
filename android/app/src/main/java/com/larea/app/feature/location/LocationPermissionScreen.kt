package com.larea.app.feature.location

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.larea.app.R
import com.larea.app.ui.components.ScreenColumn

@Composable
fun LocationPermissionScreen(onGranted: () -> Unit) {
    val context = LocalContext.current
    var coarseOnly by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val fine = result[Manifest.permission.ACCESS_FINE_LOCATION] == true
        coarseOnly = !fine && result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (fine) onGranted()
    }

    ScreenColumn(title = stringResource(R.string.location_title), subtitle = stringResource(R.string.location_body)) {
        if (coarseOnly) Text(stringResource(R.string.location_precise_required), color = MaterialTheme.colorScheme.error)
        Button(
            onClick = { launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.location_allow)) }
        TextButton(onClick = {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
        }) { Text(stringResource(R.string.location_open_settings)) }
    }
}
