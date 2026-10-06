package com.larea.app.pins

import com.larea.app.feature.pins.PinPayments
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** The dApp Store build pays for pins in USDC from the wallet. */
@Module
@InstallIn(SingletonComponent::class)
abstract class PinPaymentsModule {
    @Binds
    abstract fun pinPayments(impl: SolanaPinPayments): PinPayments
}
