package com.larea.app.core

import android.os.Handler
import android.os.Looper
import android.util.Log

/** Debug builds: logs the main thread's stack whenever it stalls for more than 2 s (ANR hunting on emulators). */
object MainThreadWatchdog {
    fun start() {
        val main = Handler(Looper.getMainLooper())
        Thread({
            while (true) {
                val answered = java.util.concurrent.atomic.AtomicBoolean(false)
                main.post { answered.set(true) }
                Thread.sleep(2_000)
                if (!answered.get()) {
                    val stack = Looper.getMainLooper().thread.stackTrace.take(40).joinToString("\n") { "    at $it" }
                    Log.w("LareaWatchdog", "main thread blocked for 2 s:\n$stack")
                }
            }
        }, "larea-watchdog").apply { isDaemon = true }.start()
    }
}
