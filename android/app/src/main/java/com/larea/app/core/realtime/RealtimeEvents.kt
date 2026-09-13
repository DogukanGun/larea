package com.larea.app.core.realtime

import com.larea.app.core.network.ChatMessage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Server → client events; mirrors docs/realtime-protocol.md. */
@Serializable
sealed class ServerEvent {
    @Serializable
    @SerialName("ack")
    data class Ack(val reqId: String? = null, val ok: Boolean, val reason: String? = null, val data: JsonObject? = null) : ServerEvent()

    @Serializable
    @SerialName("message")
    data class Message(val message: ChatMessage) : ServerEvent()

    @Serializable
    @SerialName("message_hidden")
    data class MessageHidden(val venueId: String, val messageId: String) : ServerEvent()

    @Serializable
    @SerialName("removed")
    data class Removed(val venueId: String, val reason: String, val message: String) : ServerEvent()

    @Serializable
    @SerialName("enforcement")
    data class Enforcement(val kind: String, val until: String? = null, val message: String) : ServerEvent()

    @Serializable
    @SerialName("presence")
    data class Presence(val venueId: String, val count: Int) : ServerEvent()

    @Serializable
    @SerialName("pong")
    data class Pong(val reqId: String? = null) : ServerEvent()

    @Serializable
    @SerialName("error")
    data class Error(val reqId: String? = null, val code: String, val message: String) : ServerEvent()
}

/** Ack payload for a heartbeat: `data.state` and `data.removed`. */
data class HeartbeatAck(val ok: Boolean, val state: String?, val removed: Boolean, val reason: String?)

enum class ConnectionState { Disconnected, Connecting, Connected, Suspended }
