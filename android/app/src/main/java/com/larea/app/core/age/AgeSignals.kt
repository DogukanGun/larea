package com.larea.app.core.age

import android.app.Activity
import com.google.android.gms.tasks.Task
import com.google.android.play.agesignals.AgeSignalsAccessRequest
import com.google.android.play.agesignals.AgeSignalsManagerFactory
import com.google.android.play.agesignals.AgeSignalsRequest
import com.google.android.play.agesignals.model.AgeRangeSource
import com.google.android.play.agesignals.model.AgeSignalsStatus
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** What Google Play said about the user's age. */
sealed interface AgeSignalsAnswer {
    /** Google shared an age range. */
    data class Range(val lowerBound: Int, val upperBound: Int?, val declaration: String) : AgeSignalsAnswer

    /** The user chose not to share their age range. */
    data object Declined : AgeSignalsAnswer

    /** Google has no answer here (not offered in this country, no Play Store, no range on file). */
    data object Unavailable : AgeSignalsAnswer
}

/**
 * Play Age Signals: asks the user to share their age range with Larea, then reads it.
 * Only the range and how Google obtained it leave the device; nothing else is kept.
 */
class AgeSignals {
    suspend fun request(activity: Activity): AgeSignalsAnswer {
        val manager = runCatching { AgeSignalsManagerFactory.create(activity) }.getOrElse { return AgeSignalsAnswer.Unavailable }
        val access = runCatching {
            manager.requestAgeSignalsAccess(AgeSignalsAccessRequest.builder().setActivity(activity).build()).await()
        }.getOrElse { return AgeSignalsAnswer.Unavailable }
        when (access.ageSignalsStatus()) {
            AgeSignalsStatus.NOT_SHARED -> return AgeSignalsAnswer.Declined
            AgeSignalsStatus.SHARED -> Unit
            else -> return AgeSignalsAnswer.Unavailable
        }
        val result = runCatching { manager.checkAgeSignals(AgeSignalsRequest.builder().build()).await() }
            .getOrElse { return AgeSignalsAnswer.Unavailable }
        val lower = result.ageLower() ?: return AgeSignalsAnswer.Unavailable
        // Any range Google shares is platform-sourced; an unspecified source is reported as unknown.
        val declaration = if (result.ageRangeSource() == null || result.ageRangeSource() == AgeRangeSource.UNSPECIFIED) "unknown" else "confirmed"
        return AgeSignalsAnswer.Range(lower, result.ageUpper(), declaration)
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { cont.resume(it) }
    addOnFailureListener { cont.resumeWithException(it) }
    addOnCanceledListener { cont.cancel() }
}
