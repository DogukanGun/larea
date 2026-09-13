package com.larea.app.core.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface LareaApi {
    @POST("auth/register") suspend fun register(@Body body: RegisterRequest): AuthResult
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): AuthResult
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest)

    @GET("me") suspend fun me(): MeView
    @PATCH("me") suspend fun updateMe(@Body body: UpdateMeRequest): MeView
    @DELETE("me") suspend fun deleteMe()

    @POST("verification/sessions") suspend fun startVerification(): StartedSession
    @GET("verification/status") suspend fun verificationStatus(): VerificationStatus

    @GET("venues/nearby")
    suspend fun nearby(@Query("lat") lat: Double, @Query("lng") lng: Double, @Query("accuracy") accuracy: Double): NearbyResponse

    @POST("venues/{id}/join") suspend fun join(@Path("id") venueId: String, @Body fix: LocationFixBody): JoinResult
    @POST("venues/{id}/leave") suspend fun leave(@Path("id") venueId: String)

    @GET("venues/{id}/messages")
    suspend fun history(@Path("id") venueId: String, @Query("afterId") afterId: String? = null, @Query("limit") limit: Int? = null): HistoryResponse

    @POST("venues/{id}/messages") suspend fun send(@Path("id") venueId: String, @Body body: SendMessageRequest): SendResult

    @POST("messages/{id}/reports") suspend fun report(@Path("id") messageId: String, @Body body: CreateReportRequest)

    @POST("users/{id}/block") suspend fun block(@Path("id") userId: String)
    @DELETE("users/{id}/block") suspend fun unblock(@Path("id") userId: String)
    @GET("me/blocks") suspend fun blocks(): BlocksResponse
}
