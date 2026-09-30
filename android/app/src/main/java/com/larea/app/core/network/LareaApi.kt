package com.larea.app.core.network

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

interface LareaApi {
    @POST("auth/register") suspend fun register(@Body body: RegisterRequest): AuthResult
    @POST("auth/login") suspend fun login(@Body body: LoginRequest): AuthResult
    @POST("auth/logout") suspend fun logout(@Body body: RefreshRequest)

    @GET("me") suspend fun me(): MeView
    @PATCH("me") suspend fun updateMe(@Body body: UpdateMeRequest): MeView
    @DELETE("me") suspend fun deleteMe()

    @GET("verification/status") suspend fun verificationStatus(): VerificationStatus
    @POST("verification/platform") suspend fun platformAge(@Body body: PlatformAgeRequest): VerificationStatus

    /** Debug builds only, against a backend running with NODE_ENV=test. */
    @POST("testing/verify-age") suspend fun testingVerifyAge()

    @GET("venues/nearby")
    suspend fun nearby(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("accuracy") accuracy: Double,
        @Query("viewLat") viewLat: Double? = null,
        @Query("viewLng") viewLng: Double? = null,
        @Query("viewRadiusM") viewRadiusM: Int? = null,
    ): NearbyResponse

    @POST("venues/{id}/join") suspend fun join(@Path("id") venueId: String, @Body fix: LocationFixBody): JoinResult
    @POST("venues/{id}/leave") suspend fun leave(@Path("id") venueId: String)
    @GET("venues/{id}/members") suspend fun members(@Path("id") venueId: String): MembersResponse

    @GET("venues/{id}/messages")
    suspend fun history(
        @Path("id") venueId: String,
        @Query("afterId") afterId: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("room") room: String? = null,
    ): HistoryResponse

    @POST("venues/{id}/messages") suspend fun send(@Path("id") venueId: String, @Body body: SendMessageRequest): SendResult

    @POST("venues/{id}/polls") suspend fun createPoll(@Path("id") venueId: String, @Body body: CreatePollRequest): SendResult
    @POST("polls/{id}/vote") suspend fun vote(@Path("id") pollId: String, @Body body: VoteRequest): PollResponse
    @POST("polls/{id}/close") suspend fun closePoll(@Path("id") pollId: String): PollResponse

    @POST("messages/{id}/reports") suspend fun report(@Path("id") messageId: String, @Body body: CreateReportRequest)

    @POST("users/{id}/block") suspend fun block(@Path("id") userId: String)
    @DELETE("users/{id}/block") suspend fun unblock(@Path("id") userId: String)
    @GET("me/blocks") suspend fun blocks(): BlocksResponse

    // Marketplace

    @GET("market/config") suspend fun marketConfig(): MarketConfig
    @GET("market/me") suspend fun marketMe(): MarketMeResponse

    @GET("market/listings") suspend fun listings(@QueryMap query: Map<String, String>): ListingsResponse
    @POST("market/listings") suspend fun createListing(@Body body: CreateListingRequest): Listing
    @GET("market/listings/{id}") suspend fun listing(@Path("id") id: String, @QueryMap fix: Map<String, String>): Listing
    @PATCH("market/listings/{id}") suspend fun updateListing(@Path("id") id: String, @Body body: UpdateListingRequest): Listing
    @POST("market/listings/{id}/cancel") suspend fun cancelListing(@Path("id") id: String): Listing
    @POST("market/listings/{id}/sold") suspend fun markSold(@Path("id") id: String): Listing
    @POST("market/listings/{id}/reports") suspend fun reportListing(@Path("id") id: String, @Body body: CreateReportRequest)
    @POST("market/listings/{id}/offers") suspend fun makeOffer(@Path("id") id: String, @Body body: CreateOfferRequest): Offer

    @POST("market/offers/{id}/accept") suspend fun acceptOffer(@Path("id") id: String): AcceptOfferResponse
    @POST("market/offers/{id}/decline") suspend fun declineOffer(@Path("id") id: String): Offer
    @POST("market/offers/{id}/withdraw") suspend fun withdrawOffer(@Path("id") id: String): Offer

    @GET("market/orders/{id}") suspend fun order(@Path("id") id: String): Order
    @POST("market/orders/{id}/checkout") suspend fun checkout(@Path("id") id: String): CheckoutSession
    @POST("market/orders/{id}/approve") suspend fun approveOrder(@Path("id") id: String, @Body body: ApproveOrderRequest): Order
    @POST("market/orders/{id}/cancel") suspend fun cancelOrder(@Path("id") id: String): Order

    @GET("market/stripe/account") suspend fun stripeAccount(@Query("refresh") refresh: Int? = null): StripeAccountStatus
    @POST("market/stripe/account-link") suspend fun stripeAccountLink(): StripeAccountLink
}

/** Photo uploads run on a client with a longer timeout (90 s, as on iOS). */
interface UploadApi {
    @Multipart
    @POST("uploads")
    suspend fun upload(@Part file: MultipartBody.Part): ImageAttachment
}
