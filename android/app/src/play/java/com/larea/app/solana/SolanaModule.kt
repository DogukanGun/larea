package com.larea.app.solana

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** The Play build has no Solana features. */
@Module
@InstallIn(SingletonComponent::class)
object SolanaModule {
    @Provides
    fun solanaUi(): SolanaUi = NoSolanaUi
}
