package com.larea.app

/** Backend endpoints. Overridden per build type in app/build.gradle.kts. */
object Backend {
    val baseUrl: String get() = BuildConfig.API_BASE_URL
    val wsUrl: String get() = BuildConfig.WS_URL
}
