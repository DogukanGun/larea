package com.larea.app.core.network

import kotlinx.serialization.json.Json

/** The one JSON configuration for REST and WebSocket payloads: lenient like the iOS decoders. */
val LareaJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    classDiscriminator = "type"
}
