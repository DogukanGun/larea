package com.larea.app.solana

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SolanaModule {
    @Provides
    fun solanaUi(impl: SolanaUiImpl): SolanaUi = impl

    @Provides
    @Singleton
    fun solanaApi(retrofit: Retrofit): SolanaApi = retrofit.create(SolanaApi::class.java)
}

