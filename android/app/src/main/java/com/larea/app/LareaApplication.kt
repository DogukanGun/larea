package com.larea.app

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.larea.app.di.PlainClient
import dagger.hilt.android.HiltAndroidApp
import org.maplibre.android.MapLibre
import okhttp3.OkHttpClient
import javax.inject.Inject

@HiltAndroidApp
class LareaApplication : Application(), SingletonImageLoader.Factory {
    @Inject @PlainClient lateinit var httpClient: OkHttpClient

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
        if (BuildConfig.DEBUG) com.larea.app.core.MainThreadWatchdog.start()
    }

    /** Media is public and immutable; one cache shared by chat photos, listings and the viewer (as iOS `ImageCache`). */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { httpClient })) }
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.2).build() }
        .diskCache { DiskCache.Builder().directory(context.cacheDir.resolve("images")).maxSizeBytes(200L * 1024 * 1024).build() }
        .crossfade(true)
        .build()
}
