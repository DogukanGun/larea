package com.larea.app.pins

import com.larea.app.feature.pins.PinPayments
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** The Play build pays for pins with Google Play Billing. */
@Module
@InstallIn(SingletonComponent::class)
abstract class PinPaymentsModule {
    @Binds
    abstract fun pinPayments(impl: PlayPinPayments): PinPayments
}
