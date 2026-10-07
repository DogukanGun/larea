package com.larea.app.feature.market

import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Science
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil3.compose.AsyncImage
import com.larea.app.BuildConfig
import com.larea.app.core.DebugFlags
import com.larea.app.core.auth.SessionStore
import com.larea.app.core.format.Money
import com.larea.app.core.location.LocationSource
import com.larea.app.core.media.ImageUploader
import com.larea.app.core.media.PreparedImage
import com.larea.app.core.network.CreateListingRequest
import com.larea.app.core.network.ImageAttachment
import com.larea.app.core.network.LareaApi
import com.larea.app.core.network.Listing
import com.larea.app.core.network.ListingCategory
import com.larea.app.core.network.ListingKind
import com.larea.app.core.network.MarketConfig
import com.larea.app.core.network.UpdateListingRequest
import com.larea.app.core.network.apiCall
import com.larea.app.core.network.userMessage
import com.larea.app.ui.components.GroupedCard
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.NoteCard
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.RemoteImage
import com.larea.app.ui.components.SectionFooter
import com.larea.app.ui.components.SectionHeader
import com.larea.app.ui.components.exposeTestTags
import com.larea.app.ui.components.icon
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Radius
import com.larea.app.ui.theme.Spacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import javax.inject.Inject

/** A photo on the form: picked on this device (uploaded on submit) or already on the listing being edited. */
data class PickedPhoto(val id: String, val local: PreparedImage? = null, val remote: ImageAttachment? = null)

data class ListingEditorState(
    val kind: ListingKind = ListingKind.OFFER,
    val category: ListingCategory = ListingCategory.FURNITURE,
    val title: String = "",
    val description: String = "",
    val priceText: String = "",
    val photos: List<PickedPhoto> = emptyList(),
    val busy: Boolean = false,
    val progress: String? = null,
    val error: String? = null,
    val attempted: Boolean = false,
    /** Null until known; listings from the Solana build are priced in USDC when the owner has a wallet. */
    val currency: String? = null,
) {
    val priceCents: Int? get() = Money.parse(priceText)
}

@HiltViewModel
class ListingEditorViewModel @Inject constructor(
    private val api: LareaApi,
    private val uploader: ImageUploader,
    private val location: LocationSource,
    private val sessions: SessionStore,
) : ViewModel() {

    private val _state = MutableStateFlow(ListingEditorState())
    val state: StateFlow<ListingEditorState> = _state
    private var editing: Listing? = null
    private var prepared = false
    lateinit var config: MarketConfig
        private set

    fun prepare(config: MarketConfig, editing: Listing?) {
        this.config = config
        if (prepared) return
        prepared = true
        this.editing = editing
        if (editing != null) {
            _state.value = ListingEditorState(
                kind = editing.kind,
                category = editing.category.takeIf { it != ListingCategory.UNKNOWN } ?: ListingCategory.OTHER,
                title = editing.title,
                description = editing.description,
                priceText = Money.editText(editing.priceCents),
                photos = editing.images.map { PickedPhoto(it.key, remote = it) },
            )
        }
        viewModelScope.launch {
            val hasWallet = sessions.session.first()?.user?.walletAddress != null
            val currency = editing?.currency ?: if (BuildConfig.SOLANA && hasWallet) "usdc" else config.currency
            _state.update { it.copy(currency = currency) }
        }
    }

    fun update(transform: (ListingEditorState) -> ListingEditorState) = _state.update(transform)

    fun problem(s: ListingEditorState = _state.value): String? = ListingValidation.validate(s.title, s.description, s.priceCents, config)

    fun addPhoto(image: PreparedImage) = _state.update { s ->
        if (s.photos.size >= config.maxImages) s else s.copy(photos = s.photos + PickedPhoto(UUID.randomUUID().toString(), local = image))
    }

    fun removePhoto(id: String) = _state.update { s -> s.copy(photos = s.photos.filterNot { it.id == id }) }

    suspend fun read(uri: Uri): PreparedImage = uploader.read(uri)

    /** Uploads the photos one by one, then posts (or saves) the listing. */
    fun submit(onDone: (Listing) -> Unit) {
        val s = _state.value
        _state.update { it.copy(attempted = true) }
        val price = s.priceCents
        if (problem(s) != null || price == null || s.busy) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = runCatching { editing?.let { save(it, price) } ?: create(price) }
            result.onSuccess { listing -> listing?.let(onDone) }
            result.onFailure { e -> _state.update { it.copy(error = e.userMessage()) } }
            _state.update { it.copy(busy = false, progress = null) }
        }
    }

    private suspend fun uploadAll(): List<String> {
        val photos = _state.value.photos
        val uploads = photos.count { it.local != null }
        var uploaded = 0
        return photos.mapNotNull { photo ->
            photo.remote?.let { return@mapNotNull it.id }
            val local = photo.local ?: return@mapNotNull null
            uploaded++
            _state.update { it.copy(progress = "Uploading photo $uploaded of $uploads…") }
            uploader.upload(local).getOrThrow().id
        }
    }

    private suspend fun create(price: Int): Listing? {
        var fix = location.latest.value
        if (fix == null) {
            _state.update { it.copy(progress = "Finding your location…") }
            fix = location.awaitFix()
        }
        if (fix == null) {
            _state.update { it.copy(error = "We need your location to place the listing. Move outdoors and try again.") }
            return null
        }
        val mediaIds = uploadAll()
        _state.update { it.copy(progress = "Posting…") }
        val s = _state.value
        return apiCall {
            api.createListing(CreateListingRequest(s.kind.raw, s.category.raw, s.title.trim(), s.description.trim(), price, mediaIds, fix.lat, fix.lng, fix.accuracyM, fix.mocked))
        }.getOrThrow()
    }

    /** Uploads the new photos, then sends the whole photo list so the server keeps the order. */
    private suspend fun save(listing: Listing, price: Int): Listing {
        val mediaIds = uploadAll()
        _state.update { it.copy(progress = "Saving…") }
        val s = _state.value
        return apiCall { api.updateListing(listing.id, UpdateListingRequest(s.title.trim(), s.description.trim(), s.category.raw, price, mediaIds)) }.getOrThrow()
    }
}

/**
 * Post something to sell or a request for paid help, placed at the current location; with `editing`
 * set, the same form changes an existing listing (kind and location stay as posted).
 */
@Composable
fun ListingEditor(config: MarketConfig, editing: Listing?, onDismiss: () -> Unit, onSaved: (Listing) -> Unit) {
    // A fresh form every time the editor opens (as the iOS sheet gets a new view model).
    val formKey = remember { UUID.randomUUID().toString() }
    val model: ListingEditorViewModel = hiltViewModel(key = "listing-editor-$formKey")
    model.prepare(config, editing)
    val state by model.state.collectAsStateWithLifecycle()
    val c = Larea.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    var categoryMenu by remember { mutableStateOf(false) }
    val request = state.kind == ListingKind.REQUEST
    val currency = state.currency ?: config.currency
    val remaining = (config.maxImages - state.photos.size).coerceAtLeast(1)

    fun attach(uri: Uri?) {
        uri ?: return
        scope.launch { runCatching { model.read(uri) }.onSuccess(model::addPhoto).onFailure { e -> model.update { it.copy(error = e.message) } } }
    }
    val library = rememberLauncherForActivityResult(
        if (remaining > 1) ActivityResultContracts.PickMultipleVisualMedia(remaining) else ActivityResultContracts.PickMultipleVisualMedia(2),
    ) { uris -> uris.take(remaining).forEach(::attach) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) attach(cameraUri) }
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }

    // Leaving mid-upload would orphan photos and lose the form, so dismissing waits for the post to finish.
    Dialog(
        onDismissRequest = { if (!state.busy) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnBackPress = !state.busy),
    ) {
        Column(Modifier.exposeTestTags().fillMaxSize().background(c.grouped).statusBarsPadding().imePadding()) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.s, vertical = 4.dp)) {
                TextButton(onClick = onDismiss, enabled = !state.busy, modifier = Modifier.testTag("market.create.cancel")) { Text("Cancel") }
                Text(if (editing == null) "New listing" else "Edit listing", style = LareaType.headline, color = c.text, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
                Box(Modifier.size(72.dp, 1.dp))
            }
            Column(Modifier.verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = Spacing.xl)) {
                if (editing == null) {
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = Spacing.screen, vertical = Spacing.s).testTag("market.create.kind")) {
                        listOf(ListingKind.OFFER to "Selling", ListingKind.REQUEST to "Looking for help").forEachIndexed { index, (kind, label) ->
                            SegmentedButton(
                                selected = state.kind == kind,
                                onClick = { model.update { it.copy(kind = kind) } },
                                shape = SegmentedButtonDefaults.itemShape(index, 2),
                                colors = SegmentedButtonDefaults.colors(activeContainerColor = c.brandTint, activeContentColor = c.brandDeep),
                                icon = {},
                            ) { Text(label) }
                        }
                    }
                }
                SectionHeader("Photos")
                GroupedCard {
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.s), modifier = Modifier.horizontalScroll(rememberScrollState()).padding(Spacing.l)) {
                        state.photos.forEach { photo -> PhotoThumb(photo) { model.removePhoto(photo.id) } }
                        if (state.photos.size < config.maxImages) {
                            Box {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                    modifier = Modifier
                                        .size(84.dp)
                                        .background(c.brandTint, RoundedCornerShape(Radius.field))
                                        .clickable { menu = true }
                                        .semantics { contentDescription = "Add photo" }
                                        .testTag("market.create.photos"),
                                ) {
                                    Icon(Icons.Filled.Add, contentDescription = null, tint = c.brandPrimary)
                                    Text("Add", style = LareaType.caption.copy(fontWeight = FontWeight.SemiBold), color = c.brandPrimary)
                                }
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, modifier = Modifier.exposeTestTags()) {
                                    DropdownMenuItem(text = { Text("Photo library") }, leadingIcon = { Icon(Icons.Filled.PhotoLibrary, null) }, onClick = {
                                        menu = false
                                        library.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                                    })
                                    if (hasCamera) DropdownMenuItem(text = { Text("Take photo") }, leadingIcon = { Icon(Icons.Filled.CameraAlt, null) }, onClick = {
                                        menu = false
                                        val file = File(context.cacheDir, "camera").apply { mkdirs() }.resolve("listing-${System.currentTimeMillis()}.jpg")
                                        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                                        cameraUri = uri
                                        camera.launch(uri)
                                    })
                                    if (DebugFlags.testSeedImage) DropdownMenuItem(
                                        text = { Text("Use test image") },
                                        leadingIcon = { Icon(Icons.Filled.Science, null) },
                                        onClick = { menu = false; model.addPhoto(ImageUploader.testImage()) },
                                        modifier = Modifier.testTag("market.create.seedPhoto"),
                                    )
                                }
                            }
                        }
                    }
                }
                SectionFooter("Up to ${config.maxImages} photos. ${if (request) "Show what you need help with." else "Clear photos sell faster."}")
                SectionHeader("Details")
                GroupedCard {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(Spacing.m)) {
                        LareaField(
                            "Title", state.title, { v -> model.update { it.copy(title = v) } },
                            placeholder = if (request) "What do you need help with?" else "What are you selling?",
                            capitalization = KeyboardCapitalization.Sentences, tag = "market.create.title",
                        )
                        LareaField(
                            "Description", state.description, { v -> model.update { it.copy(description = v) } },
                            placeholder = "Condition, size, when you're available…", singleLine = false, minLines = 3, maxLines = 8,
                            capitalization = KeyboardCapitalization.Sentences, tag = "market.create.description",
                        )
                        Box {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(Spacing.m),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(c.fill, RoundedCornerShape(Radius.field))
                                    .clickable { categoryMenu = true }
                                    .padding(horizontal = 14.dp, vertical = 14.dp)
                                    .testTag("market.create.category"),
                            ) {
                                Text("Category", style = LareaType.body, color = c.text, modifier = Modifier.weight(1f))
                                Icon(state.category.icon, contentDescription = null, tint = c.brandPrimary, modifier = Modifier.size(18.dp))
                                Text(state.category.label, style = LareaType.body, color = c.secondaryText)
                            }
                            DropdownMenu(expanded = categoryMenu, onDismissRequest = { categoryMenu = false }, modifier = Modifier.exposeTestTags()) {
                                ListingCategory.selectable.forEach { category ->
                                    DropdownMenuItem(
                                        text = { Text(category.label) },
                                        leadingIcon = { Icon(category.icon, null) },
                                        onClick = { categoryMenu = false; model.update { it.copy(category = category) } },
                                    )
                                }
                            }
                        }
                        LareaField(
                            "${if (request) "Budget" else "Price"} (${currency.uppercase()})", state.priceText, { v -> model.update { it.copy(priceText = v) } },
                            placeholder = "0", keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done, tag = "market.create.price",
                        )
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(Spacing.m), modifier = Modifier.padding(horizontal = Spacing.screen, vertical = Spacing.l)) {
                    NoteCard(
                        Icons.Filled.LocationOn,
                        if (editing != null) "The listing stays where you posted it. Cancel it and post again to move it."
                        else "Listed at your current location. Others see an approximate position, never the exact spot.",
                    )
                    if (state.attempted) model.problem(state)?.let { InlineError(it) }
                    state.error?.let { InlineError(it) }
                    state.progress?.let { progress ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.s)) {
                            CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp), color = c.brandPrimary)
                            Text(progress, style = LareaType.subheadline, color = c.secondaryText)
                        }
                    }
                    PrimaryButton(
                        if (editing != null) "Save changes" else if (request) "Post request" else "Post listing",
                        onClick = { model.submit(onSaved) },
                        loading = state.busy,
                        tag = "market.submit",
                    )
                }
            }
        }
    }
}

/** One 84dp square in the photo strip: a local preview or the listing's existing photo, with a remove button. */
@Composable
private fun PhotoThumb(photo: PickedPhoto, onRemove: () -> Unit) {
    Box(Modifier.size(84.dp).clip(RoundedCornerShape(Radius.field))) {
        if (photo.local != null) {
            AsyncImage(photo.local.jpeg, contentDescription = "Photo", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            RemoteImage(photo.remote?.thumbnailUrl, Modifier.fillMaxSize())
        }
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(4.dp)
                .size(22.dp)
                .background(Color.Black.copy(alpha = 0.6f), CircleShape)
                .clickable(onClick = onRemove)
                .semantics { contentDescription = "Remove photo" },
        ) { Icon(Icons.Filled.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp)) }
    }
}
