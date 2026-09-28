package com.larea.app.core.network

import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException

/** A structured `{code, message}` error from the backend. */
class ApiException(
    val code: String,
    override val message: String,
    val status: Int,
    val mutedUntil: String? = null,
    val retryAfterSec: Int? = null,
    val suspendedAt: String? = null,
) : Exception(message)

/** The backend could not be reached. */
class NetworkException(cause: Throwable) : Exception("network", cause)

private val lenientJson = Json { ignoreUnknownKeys = true; explicitNulls = false }

fun Throwable.toApiFailure(): Exception = when (this) {
    is ApiException, is NetworkException -> this
    is HttpException -> {
        val body = response()?.errorBody()?.string().orEmpty()
        val parsed = runCatching { lenientJson.decodeFromString<ApiError>(body) }.getOrNull()
        ApiException(
            code = parsed?.code ?: "HTTP_${code()}",
            message = parsed?.message ?: "Something went wrong. Please try again.",
            status = code(),
            mutedUntil = parsed?.mutedUntil,
            retryAfterSec = parsed?.retryAfterSec,
            suspendedAt = parsed?.suspendedAt,
        )
    }
    is IOException -> NetworkException(this)
    is kotlinx.serialization.SerializationException -> DecodingException(this)
    else -> Exception(message ?: "Unexpected error", this)
}

/** The response did not have the expected shape. */
class DecodingException(cause: Throwable) : Exception("decoding", cause)

/** The API error code, when this is a structured backend error. */
val Throwable.apiCode: String? get() = (this as? ApiException)?.code

/** Text to show the user for any failure (same copy as iOS `APIError`). */
fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message
    is NetworkException -> "Can't reach Larea. Check your connection and try again."
    is DecodingException -> "Unexpected response from the server."
    else -> message ?: "Something went wrong."
}

/** Runs an API call and normalises failures into ApiException / NetworkException. */
suspend fun <T> apiCall(block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (e: kotlinx.coroutines.CancellationException) {
    throw e
} catch (e: Throwable) {
    Result.failure(e.toApiFailure())
}
