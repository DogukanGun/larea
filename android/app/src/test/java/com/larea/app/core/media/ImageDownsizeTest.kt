package com.larea.app.core.media

import android.app.Application
import android.graphics.Bitmap
import androidx.exifinterface.media.ExifInterface
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

/** Mirrors ios/LareaTests/ImageDownsizeTests.swift (real Android graphics through Robolectric). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = Application::class)
class ImageDownsizeTest {
    private fun photo(width: Int, height: Int): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(0xFF30B0C7.toInt()) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    }

    /** The same picture with a GPS position and camera make written into its EXIF, like a real photo. */
    private fun geotagged(jpeg: ByteArray): ByteArray {
        val file = File.createTempFile("geo", ".jpg").apply { writeBytes(jpeg) }
        ExifInterface(file).apply {
            setLatLong(48.1374, 11.5755)
            setAttribute(ExifInterface.TAG_MAKE, "TestCam")
            saveAttributes()
        }
        return file.readBytes()
    }

    @Test
    fun `downsizes to the long edge and keeps the aspect`() {
        val out = ImageUploader.downsizedJpeg(photo(4000, 3000))
        assertEquals(1600, out.width)
        assertEquals(1200, out.height)
        assertArrayEquals(byteArrayOf(0xFF.toByte(), 0xD8.toByte()), out.jpeg.copyOfRange(0, 2))
    }

    @Test
    fun `small photos are not enlarged`() {
        val out = ImageUploader.downsizedJpeg(photo(300, 200))
        assertEquals(300, out.width)
        assertEquals(200, out.height)
    }

    @Test
    fun `location and camera metadata are dropped`() {
        val input = geotagged(photo(800, 600))
        assertEquals("TestCam", ExifInterface(ByteArrayInputStream(input)).getAttribute(ExifInterface.TAG_MAKE))
        val out = ImageUploader.downsizedJpeg(input)
        val exif = ExifInterface(ByteArrayInputStream(out.jpeg))
        assertNull(exif.latLong)
        assertNull(exif.getAttribute(ExifInterface.TAG_MAKE))
    }

    @Test(expected = ImageUploadException::class)
    fun `garbage is rejected`() {
        ImageUploader.downsizedJpeg("not an image".toByteArray())
    }
}
