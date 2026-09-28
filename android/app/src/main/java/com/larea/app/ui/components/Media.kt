package com.larea.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BrokenImage
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.compose.AsyncImagePainter
import com.larea.app.core.network.ImageAttachment
import com.larea.app.ui.theme.Larea
import kotlinx.coroutines.launch

/** An image from the API's media store, cached by Coil. No URL means "no photo"; only a failed download shows the warning glyph. */
@Composable
fun RemoteImage(url: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop, contentDescription: String? = null) {
    val c = Larea.colors
    if (url == null) {
        Placeholder(failed = false, modifier = modifier)
        return
    }
    SubcomposeAsyncImage(model = url, contentDescription = contentDescription, contentScale = contentScale, modifier = modifier) {
        val state by painter.state.collectAsState()
        when (state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            is AsyncImagePainter.State.Error -> Placeholder(failed = true)
            else -> Box(Modifier.fillMaxSize().background(c.fill))
        }
    }
}

@Composable
private fun Placeholder(failed: Boolean, modifier: Modifier = Modifier) {
    val c = Larea.colors
    Box(modifier.fillMaxSize().background(c.fill), contentAlignment = Alignment.Center) {
        Icon(if (failed) Icons.Filled.BrokenImage else Icons.Filled.Photo, contentDescription = null, tint = c.tertiaryText, modifier = Modifier.size(28.dp))
    }
}

/** Full-screen photo with pinch zoom (1–4×), double tap (2.5×); swipe down when not zoomed, or the close button, dismisses. */
@Composable
fun ImageViewer(image: ImageAttachment, onDismiss: () -> Unit, previewModel: Any? = null) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        var scale by remember { mutableFloatStateOf(1f) }
        var pan by remember { mutableStateOf(Offset.Zero) }
        val drag = remember { Animatable(0f) }
        val scope = rememberCoroutineScope()
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            SubcomposeAsyncImage(
                model = previewModel ?: image.fullUrl,
                contentDescription = "Photo",
                contentScale = ContentScale.Fit,
                loading = { RemoteImage(image.thumbnailUrl, contentScale = ContentScale.Fit) },
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale; scaleY = scale
                        translationX = pan.x; translationY = pan.y + drag.value
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, panChange, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 4f)
                            pan = if (scale > 1f) pan + panChange else Offset.Zero
                        }
                    }
                    .pointerInput(Unit) {
                        detectTapGestures(onDoubleTap = {
                            scale = if (scale > 1f) 1f else 2.5f
                            if (scale == 1f) pan = Offset.Zero
                        })
                    }
                    .pointerInput(Unit) {
                        detectVerticalDragGestures(
                            onVerticalDrag = { _, dy -> if (scale == 1f) scope.launch { drag.snapTo((drag.value + dy).coerceAtLeast(0f)) } },
                            onDragEnd = {
                                if (scale == 1f && drag.value > 120.dp.toPx()) onDismiss() else scope.launch { drag.animateTo(0f) }
                            },
                        )
                    },
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(16.dp)
                    .size(40.dp)
                    .background(Color.White.copy(alpha = 0.18f), CircleShape)
                    .testTag("image.viewer.close"),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}
