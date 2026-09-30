package com.larea.app.ui.map

import android.view.Gravity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.larea.app.ui.theme.Larea
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import kotlin.math.cos
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.roundToInt

private const val LIGHT_STYLE = "https://tiles.openfreemap.org/styles/liberty"
private const val DARK_STYLE = "https://tiles.openfreemap.org/styles/dark"
private const val METERS_PER_DEGREE = 111_320.0
private const val EARTH_CIRCUMFERENCE_M = 40_075_016.686

/** Where the map is looking: its centre plus half the larger visible span in metres. */
data class MapViewport(val lat: Double, val lng: Double, val radiusM: Double)

/**
 * Camera access for the screens around a [LareaMap]. `cameraTick` changes on every camera frame so
 * overlays placed with [placeAt] follow the map during gestures and animations.
 */
@Stable
class MapController {
    internal var map: MapLibreMap? by mutableStateOf(null)
    var cameraTick by mutableIntStateOf(0)
        internal set
    private var pendingMove: (() -> Unit)? = null
    internal var heightPx = 0
    internal var widthPx = 0

    /** Share of the map height covered from below (the bottom panel); camera moves centre in the rest. */
    var coveredFraction by mutableStateOf(0f)

    val ready: Boolean get() = map != null

    fun toScreen(lat: Double, lng: Double): Offset? =
        map?.projection?.toScreenLocation(LatLng(lat, lng))?.let { Offset(it.x, it.y) }

    /** Screen pixels per metre here, measured on the projection (no assumptions about MapLibre's units). */
    fun pixelsPerMeter(lat: Double, lng: Double): Double {
        val projection = map?.projection ?: return 0.0
        val a = projection.toScreenLocation(LatLng(lat, lng))
        val b = projection.toScreenLocation(LatLng(lat + 1_000 / METERS_PER_DEGREE, lng))
        return kotlin.math.hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()) / 1_000
    }

    /** Centres on a point showing about `spanM` metres across (MapKit's region with lat/lng metres). */
    fun show(lat: Double, lng: Double, spanM: Double, animated: Boolean = true) {
        val move = {
            val map = map
            if (map != null) {
                val half = spanM.coerceIn(100.0, 2_000_000.0) / 2
                // Same scale as MapKit's region: the span fills the narrower side of the map (the width, in
                // portrait). Then move the target south so the point sits in the middle of the part the
                // bottom panel leaves uncovered.
                val sidePx = minOf(widthPx, heightPx).takeIf { it > 0 } ?: 1080
                val wanted = sidePx / (2 * half)
                // Web Mercator with 512-pixel tiles in physical pixels (what MapLibre Android uses); computed
                // directly because a map view that has not been laid out yet has no usable projection.
                val zoom = log2(EARTH_CIRCUMFERENCE_M * cos(Math.toRadians(lat)) * wanted / 512).coerceIn(1.0, 20.0)
                val offsetPx = heightPx * coveredFraction.coerceIn(0f, 0.7f) / 2
                val target = LatLng((lat - offsetPx / wanted / METERS_PER_DEGREE).coerceIn(-85.0, 85.0), lng)
                val update = CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(target).zoom(zoom).bearing(0.0).build())
                if (animated) map.animateCamera(update, 450) else map.moveCamera(update)
            }
        }
        if (map == null) pendingMove = move else move()
    }

    internal fun attach(map: MapLibreMap) {
        this.map = map
        pendingMove?.let { pendingMove = null; it() }
    }

    fun viewport(): MapViewport? {
        val map = map ?: return null
        val bounds = map.projection.visibleRegion.latLngBounds
        val center = bounds.center
        val latMeters = (bounds.latitudeNorth - bounds.latitudeSouth) * METERS_PER_DEGREE
        val lngMeters = (bounds.longitudeEast - bounds.longitudeWest) * METERS_PER_DEGREE * cos(Math.toRadians(center.latitude))
        return MapViewport(center.latitude, center.longitude, max(latMeters, lngMeters) / 2)
    }
}

@Composable
fun rememberMapController(): MapController = remember { MapController() }

/**
 * An OpenStreetMap vector map (MapLibre + OpenFreeMap tiles). The built-in points of interest are
 * hidden like on iOS; pins and circles are Compose overlays in [overlay].
 */
@Composable
fun LareaMap(
    controller: MapController,
    modifier: Modifier = Modifier,
    attributionTopMargin: Dp = 116.dp,
    onCameraIdle: (MapViewport) -> Unit = {},
    onMapClick: () -> Unit = {},
    overlay: @Composable BoxScope.() -> Unit = {},
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val dark = Larea.colors.isDark
    val idle by rememberUpdatedState(onCameraIdle)
    val click by rememberUpdatedState(onMapClick)
    val mapView = remember {
        MapView(context).apply { onCreate(null) }
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onStop()
            mapView.onDestroy()
            controller.map = null
        }
    }
    DisposableEffect(mapView, dark) {
        mapView.getMapAsync { map ->
            map.setStyle(Style.Builder().fromUri(if (dark) DARK_STYLE else LIGHT_STYLE)) { style ->
                style.layers.filter { it.id.startsWith("poi") }.forEach { style.removeLayer(it) }
            }
            if (controller.map == null) {
                with(map.uiSettings) {
                    isCompassEnabled = true
                    compassGravity = Gravity.TOP or Gravity.END
                    val top = with(density) { attributionTopMargin.roundToPx() }
                    val side = with(density) { 16.dp.roundToPx() }
                    setCompassMargins(0, top + with(density) { 44.dp.roundToPx() }, side, 0)
                    logoGravity = Gravity.TOP or Gravity.START
                    setLogoMargins(side, top, 0, 0)
                    attributionGravity = Gravity.TOP or Gravity.START
                    setAttributionMargins(side + with(density) { 88.dp.roundToPx() }, top, 0, 0)
                    isTiltGesturesEnabled = false
                }
                map.addOnCameraMoveListener { controller.cameraTick++ }
                map.addOnCameraIdleListener {
                    controller.cameraTick++
                    controller.viewport()?.let { idle(it) }
                }
                map.addOnMapClickListener { click(); false }
                controller.attach(map)
                controller.cameraTick++
            }
        }
        onDispose { }
    }
    Box(modifier.onSizeChanged { controller.heightPx = it.height; controller.widthPx = it.width }) {
        AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize()) { overlay() }
    }
}

/** Places an overlay so that its centre (or bottom, with `anchorBottom`) sits on the coordinate and follows the camera. */
fun Modifier.placeAt(controller: MapController, lat: Double, lng: Double, anchorBottom: Boolean = false): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints.copy(minWidth = 0, minHeight = 0))
    layout(placeable.width, placeable.height) {
        @Suppress("UNUSED_EXPRESSION") controller.cameraTick
        val point = controller.toScreen(lat, lng)
        if (point != null) {
            val x = point.x.roundToInt() - placeable.width / 2
            val y = point.y.roundToInt() - if (anchorBottom) placeable.height else placeable.height / 2
            placeable.place(x, y)
        }
    }
}

/** A translucent circle of `radiusM` metres around a point (the 200 m join radius, the market radius). */
@Composable
fun MapCircle(controller: MapController, lat: Double, lng: Double, radiusM: Double, color: Color, strokeAlpha: Float = 0.6f, fillAlpha: Float = 0.12f) {
    Box(
        Modifier
            .fillMaxSize()
            .drawBehind {
                @Suppress("UNUSED_EXPRESSION") controller.cameraTick
                val center = controller.toScreen(lat, lng) ?: return@drawBehind
                val radiusPx = (radiusM * controller.pixelsPerMeter(lat, lng)).toFloat()
                drawCircle(color.copy(alpha = fillAlpha), radiusPx, center)
                drawCircle(color.copy(alpha = strokeAlpha), radiusPx, center, style = Stroke(width = 1.5.dp.toPx()))
            },
    )
}

/** The user's position as a blue dot with a white ring (MapKit's UserAnnotation). */
@Composable
fun UserDot(controller: MapController, lat: Double, lng: Double) {
    Box(
        Modifier
            .placeAt(controller, lat, lng)
            .size(20.dp)
            .background(Color.White, CircleShape)
            .border(4.dp, Color.White, CircleShape)
            .offset { IntOffset.Zero },
    ) {
        Box(Modifier.fillMaxSize().background(Color(0xFF0A84FF), CircleShape).border(3.dp, Color.White, CircleShape))
    }
}
