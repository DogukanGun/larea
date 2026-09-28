package com.larea.app.di

import android.content.Context
import com.larea.app.Backend
import com.larea.app.core.age.AgeSignals
import com.larea.app.core.media.ImageUploader
import com.larea.app.core.auth.SessionRepository
import com.larea.app.core.auth.SessionStore
import com.larea.app.core.auth.TokenRefresher
import com.larea.app.core.location.LocationSource
import com.larea.app.core.network.AuthInterceptor
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.LareaJson
import com.larea.app.core.network.TokenAuthenticator
import com.larea.app.core.network.UploadApi
import com.larea.app.core.realtime.RealtimeClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PlainClient

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun json(): Json = LareaJson

    @Provides
    @Singleton
    fun sessionStore(@ApplicationContext context: Context, json: Json): SessionStore = SessionStore(context, json)

    @Provides
    @Singleton
    @PlainClient
    fun plainClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun tokenRefresher(@PlainClient client: OkHttpClient, json: Json, store: SessionStore): TokenRefresher =
        TokenRefresher(client, Backend.baseUrl, json, store)

    @Provides
    @Singleton
    fun apiClient(@PlainClient plain: OkHttpClient, store: SessionStore, refresher: TokenRefresher): OkHttpClient =
        plain.newBuilder()
            .addInterceptor(AuthInterceptor(store))
            .authenticator(TokenAuthenticator(refresher))
            .build()

    @Provides
    @Singleton
    fun api(client: OkHttpClient, json: Json): LareaApi = Retrofit.Builder()
        .baseUrl(Backend.baseUrl)
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(LareaApi::class.java)

    @Provides
    @Singleton
    fun uploadApi(client: OkHttpClient, json: Json): UploadApi = Retrofit.Builder()
        .baseUrl(Backend.baseUrl)
        .client(client.newBuilder().writeTimeout(90, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build())
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(UploadApi::class.java)

    @Provides
    @Singleton
    fun sessionRepository(api: LareaApi, store: SessionStore): SessionRepository = SessionRepository(api, store)

    @Provides
    @Singleton
    fun realtimeClient(@PlainClient client: OkHttpClient, store: SessionStore, refresher: TokenRefresher, json: Json): RealtimeClient =
        RealtimeClient(client, Backend.wsUrl, store, refresher, json)

    @Provides
    @Singleton
    fun imageUploader(@ApplicationContext context: Context, api: UploadApi): ImageUploader = ImageUploader(context, api)

    @Provides
    @Singleton
    fun ageSignals(): AgeSignals = AgeSignals()

    @Provides
    @Singleton
    fun locationSource(@ApplicationContext context: Context): LocationSource = LocationSource(context)
}
