package com.larea.app.core.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

data class Fix(val lat: Double, val lng: Double, val accuracyM: Double, val mocked: Boolean, val timeMs: Long)

enum class LocationPermission { Denied, CoarseOnly, Precise }

/**
 * Location fixes from the platform LocationManager (no Play Services). Coordinates are
 * only ever sent to the backend for the eligibility check.
 */
class LocationSource(private val context: Context) {
    private val manager get() = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    fun permission(): LocationPermission {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return when {
            fine -> LocationPermission.Precise
            coarse -> LocationPermission.CoarseOnly
            else -> LocationPermission.Denied
        }
    }

    private fun provider(): String? = when {
        Build.VERSION.SDK_INT >= 31 && manager.isProviderEnabled(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        else -> null
    }

    /** Continuous fixes while collected. Requires the precise permission. */
    @SuppressLint("MissingPermission")
    fun fixes(intervalMs: Long = 10_000L): Flow<Fix> = callbackFlow {
        if (permission() != LocationPermission.Precise) {
            close(SecurityException("precise location permission not granted"))
            return@callbackFlow
        }
        val provider = provider()
        if (provider == null) {
            close(IllegalStateException("no location provider enabled"))
            return@callbackFlow
        }
        val listener = LocationListenerCompat { location -> trySend(location.toFix()) }
        val request = LocationRequestCompat.Builder(intervalMs)
            .setQuality(LocationRequestCompat.QUALITY_HIGH_ACCURACY)
            .setMinUpdateDistanceMeters(0f)
            .build()
        LocationManagerCompat.requestLocationUpdates(manager, provider, request, listener, Looper.getMainLooper())
        manager.getLastKnownLocation(provider)?.takeIf { System.currentTimeMillis() - it.time < 30_000 }?.let { trySend(it.toFix()) }
        awaitClose { LocationManagerCompat.removeUpdates(manager, listener) }
    }

    /** One reasonably fresh fix, or null after the timeout. */
    suspend fun awaitFix(timeoutMs: Long = 15_000L): Fix? =
        withTimeoutOrNull(timeoutMs) { runCatching { fixes(2_000L).first() }.getOrNull() }

    private fun Location.toFix() = Fix(
        lat = latitude,
        lng = longitude,
        accuracyM = if (hasAccuracy()) accuracy.toDouble() else 10_000.0,
        mocked = if (Build.VERSION.SDK_INT >= 31) isMock else @Suppress("DEPRECATION") isFromMockProvider,
        timeMs = time,
    )
}
