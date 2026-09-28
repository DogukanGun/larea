package com.larea.app.feature.location

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.larea.app.core.location.LocationPermission
import com.larea.app.ui.components.HeroGlyph
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LinkButton
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.ScreenScaffold

private const val PREFS = "larea.prefs"
private const val ASKED = "location_asked"

@Composable
fun LocationPermissionScreen(permission: LocationPermission, onChanged: () -> Unit) {
    val context = LocalContext.current
    val activity = context as Activity
    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    var asked by remember { mutableStateOf(prefs.getBoolean(ASKED, false)) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        prefs.edit().putBoolean(ASKED, true).apply()
        asked = true
        onChanged()
    }
    val request = { launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
    // Once the user has said no and Android stops showing the dialog, only Settings can change it.
    val blocked = asked && !activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)

    ScreenScaffold(
        title = "Where are you?",
        subtitle = "Your location is used to determine which nearby chats you can join. Your exact location is not shown to other users.",
        hero = { HeroGlyph(Icons.Filled.LocationOn) },
    ) {
        NoteCard(Icons.Filled.VisibilityOff, "Nobody in a chat can see where you are. We only check that you're within 200 m of the place.")
        when {
            permission == LocationPermission.CoarseOnly && !blocked -> {
                InlineError("Larea needs precise location to confirm you're at a place.")
                PrimaryButton("Use precise location", onClick = request, tag = "location.precise")
            }
            permission == LocationPermission.CoarseOnly || (permission == LocationPermission.Denied && blocked) -> {
                InlineError(
                    if (permission == LocationPermission.CoarseOnly) "Larea needs precise location to confirm you're at a place. Turn on Use precise location for Larea in Settings."
                    else "Location access is off for Larea. Turn it on in Settings to see nearby chats.",
                )
                PrimaryButton("Open Settings", onClick = { openAppSettings(context) })
            }
            else -> {
                PrimaryButton("Allow location", onClick = request, tag = "location.allow")
                LinkButton("Open Settings", onClick = { openAppSettings(context) })
            }
        }
    }
}

fun openAppSettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}
