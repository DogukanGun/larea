package com.larea.app.core.network

import com.larea.app.Backend
import java.net.URI

/** Absolute URLs for media the API returned (absolute already, or relative like `/media/x.jpg`). */
object MediaUrls {
    private val loopbackHosts = setOf("localhost", "127.0.0.1")

    fun resolve(raw: String, base: String = Backend.baseUrl): String = runCatching {
        val baseUri = URI(base)
        val resolved = baseUri.resolve(raw)
        // A local backend announces itself as localhost; on the emulator that is the device itself,
        // so point loopback media URLs at the host the API is reached through (10.0.2.2).
        if (resolved.host in loopbackHosts && baseUri.host !in loopbackHosts) {
            URI(baseUri.scheme, resolved.userInfo, baseUri.host, baseUri.port, resolved.path, resolved.query, resolved.fragment).toString()
        } else {
            resolved.toString()
        }
    }.getOrDefault(raw)
}
