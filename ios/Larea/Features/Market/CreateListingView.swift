import PhotosUI
import SwiftUI

/// Post something to sell or a request for paid help, placed at the current location; with `editing`
/// set, the same form changes an existing listing (kind and location stay as posted).
struct CreateListingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let config: MarketConfig
    var editing: Listing? = nil
    let onCreated: (Listing) -> Void
    @State private var model: CreateListingViewModel?
    @State private var pickedItems: [PhotosPickerItem] = []
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var attempted = false
    @FocusState private var priceFocused: Bool

    var body: some View {
        NavigationStack {
            Group {
                if let model { form(model) } else { ProgressView() }
            }
            .navigationTitle(editing == nil ? "New listing" : "Edit listing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // Leaving mid-upload would orphan photos and lose the form, so Cancel waits for the post to finish.
                    Button("Cancel") { dismiss() }
                        .disabled(model?.busy == true)
                        .accessibilityIdentifier("market.create.cancel")
                }
            }
        }
        .onAppear { if model == nil { model = CreateListingViewModel(api: env.api, location: env.location, config: config, editing: editing) } }
        .interactiveDismissDisabled(model?.busy == true)
    }

    @ViewBuilder
    private func form(_ model: CreateListingViewModel) -> some View {
        @Bindable var model = model
        List {
            if !model.isEditing {
                Section {
                    Picker("Kind", selection: $model.kind) {
                        Text("Selling").tag(ListingKind.offer)
                        Text("Looking for help").tag(ListingKind.request)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("market.create.kind")
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
            }
            Section("Photos") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.s) {
                        ForEach(model.photos) { photo in
                            PhotoThumb(photo: photo) { model.removePhoto(photo.id) }
                        }
                        if model.canAddPhoto {
                            Menu {
                                Button("Photo library", systemImage: "photo.on.rectangle") { showLibrary = true }
                                if CameraPicker.isAvailable {
                                    Button("Take photo", systemImage: "camera") { showCamera = true }
                                }
                                #if DEBUG
                                if TestImage.enabled {
                                    Button("Use test image", systemImage: "testtube.2") { model.addPhoto(TestImage.make()) }
                                        .accessibilityIdentifier("market.create.seedPhoto")
                                }
                                #endif
                            } label: {
                                VStack(spacing: 4) {
                                    Image(systemName: "plus").font(.title3.weight(.bold))
                                    Text("Add").font(.caption.weight(.semibold))
                                }
                                .foregroundStyle(Color.brandPrimary)
                                .frame(width: 84, height: 84)
                                .background(Color.brandTint, in: RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                            }
                            .accessibilityLabel("Add photo")
                            .accessibilityIdentifier("market.create.photos")
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                Text("Up to \(config.maxImages) photos. \(model.kind == .request ? "Show what you need help with." : "Clear photos sell faster.")")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Details") {
                TextField(model.kind == .request ? "What do you need help with?" : "What are you selling?", text: $model.title)
                    .accessibilityIdentifier("market.create.title")
                TextField("Description (condition, size, when you're available…)", text: $model.description, axis: .vertical)
                    .lineLimit(3...8)
                    .accessibilityIdentifier("market.create.description")
                Picker("Category", selection: $model.category) {
                    ForEach(ListingCategory.selectable, id: \.self) { Label($0.label, systemImage: $0.symbol).tag($0) }
                }
                .accessibilityIdentifier("market.create.category")
                HStack {
                    Text(model.kind == .request ? "Budget" : "Price")
                    Spacer()
                    TextField("0", text: $model.priceText)
                        .keyboardType(.decimalPad)
                        .focused($priceFocused)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 140)
                        .accessibilityIdentifier("market.create.price")
                    Text(config.currency.uppercased()).foregroundStyle(.secondary)
                }
            }
            Section {
                NoteCard(symbol: "location.fill", text: model.isEditing ? "The listing stays where you posted it. Cancel it and post again to move it." : "Listed at your current location. Others see an approximate position, never the exact spot.")
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                if attempted, let problem = model.problem {
                    InlineError(text: problem).listRowBackground(Color.clear)
                }
                if let error = model.error {
                    InlineError(text: error).listRowBackground(Color.clear)
                }
                if let progress = model.progress {
                    HStack(spacing: Spacing.s) { ProgressView(); Text(progress).font(.subheadline).foregroundStyle(.secondary) }
                        .listRowBackground(Color.clear)
                }
                PrimaryButton(title: model.isEditing ? "Save changes" : (model.kind == .request ? "Post request" : "Post listing"), isLoading: model.busy, identifier: "market.submit") {
                    attempted = true
                    guard model.problem == nil else { return }
                    Task {
                        if let listing = await model.submit() { onCreated(listing) }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 16, trailing: 0))
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            // The decimal pad has no return key; give the price field a way out.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { priceFocused = false }.accessibilityIdentifier("market.create.priceDone")
            }
        }
        .photosPicker(isPresented: $showLibrary, selection: $pickedItems, maxSelectionCount: max(1, config.maxImages - model.photos.count), matching: .images)
        .onChange(of: pickedItems) { _, items in
            guard !items.isEmpty else { return }
            pickedItems = []
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self) { model.addPhoto(data) }
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) { CameraPicker(onImage: { model.addPhoto($0) }).ignoresSafeArea() }
    }
}

/// One 84 pt square in the photo strip: a local preview or the listing's existing photo, with a remove button.
private struct PhotoThumb: View {
    let photo: PickedPhoto
    let onRemove: () -> Void

    var body: some View {
        thumb
            .frame(width: 84, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                        .background(.black.opacity(0.6), in: Circle())
                }
                .padding(4)
                .accessibilityLabel("Remove photo")
            }
    }

    @ViewBuilder
    private var thumb: some View {
        if let preview = photo.preview {
            Image(uiImage: preview).resizable().aspectRatio(contentMode: .fill)
        } else {
            RemoteImage(url: photo.remote?.thumbURL)
        }
    }
}
