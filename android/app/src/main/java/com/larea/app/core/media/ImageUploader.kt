package com.larea.app.core.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Shader
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.larea.app.core.network.ApiException
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.network.UploadApi
import com.larea.app.core.network.apiCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.max

class ImageUploadException(message: String) : Exception(message)

/** A photo ready to upload: re-encoded JPEG bytes with its pixel size. */
class PreparedImage(val jpeg: ByteArray, val width: Int, val height: Int)

/**
 * Downsizes a picked photo on the device and uploads it. Re-encoding through Bitmap writes a fresh
 * JPEG, so nothing of the original EXIF (location, camera) survives; orientation is baked in first.
 */
class ImageUploader(private val context: Context, private val api: UploadApi) {
    suspend fun read(uri: Uri): PreparedImage = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw ImageUploadException("That photo couldn't be read.")
        downsizedJpeg(bytes)
    }

    suspend fun upload(image: PreparedImage): Result<ImageAttachment> {
        val part = MultipartBody.Part.createFormData("file", "photo.jpg", image.jpeg.toRequestBody("image/jpeg".toMediaType()))
        return apiCall { api.upload(part) }.recoverCatching { error ->
            throw when ((error as? ApiException)?.status) {
                413 -> ImageUploadException("That photo is too large.")
                415 -> ImageUploadException("Please choose a JPEG, PNG or WebP photo.")
                else -> error
            }
        }
    }

    companion object {
        const val MAX_PIXELS = 1600
        const val JPEG_QUALITY = 82

        fun downsizedJpeg(data: ByteArray, maxPixels: Int = MAX_PIXELS, quality: Int = JPEG_QUALITY): PreparedImage {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw ImageUploadException("That photo couldn't be read.")
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxPixels) sample *= 2
            val decoded = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: throw ImageUploadException("That photo couldn't be read.")
            val rotation = runCatching { ExifInterface(ByteArrayInputStream(data)).rotationDegrees }.getOrDefault(0)
            val longEdge = max(decoded.width, decoded.height)
            val scale = if (longEdge > maxPixels) maxPixels.toFloat() / longEdge else 1f
            val matrix = Matrix().apply {
                postScale(scale, scale)
                if (rotation != 0) postRotate(rotation.toFloat())
            }
            val output = if (scale == 1f && rotation == 0) decoded else Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
            val stream = ByteArrayOutputStream()
            output.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            return PreparedImage(stream.toByteArray(), output.width, output.height)
        }

        /** A deterministic picture for UI tests (debug builds), drawn at runtime like the iOS TestImage. */
        fun testImage(): PreparedImage {
            val bitmap = Bitmap.createBitmap(640, 480, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            paint.shader = LinearGradient(0f, 0f, 640f, 480f, Color.rgb(88, 86, 214), Color.rgb(255, 149, 0), Shader.TileMode.CLAMP)
            canvas.drawRect(0f, 0f, 640f, 480f, paint)
            paint.shader = null
            paint.color = Color.WHITE
            canvas.drawOval(220f, 140f, 420f, 340f, paint)
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream)
            return downsizedJpeg(stream.toByteArray())
        }
    }
}

