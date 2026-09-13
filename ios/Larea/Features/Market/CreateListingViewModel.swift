import Foundation
import Observation
import UIKit

/// A photo on the form: either picked on this device (uploaded on submit) or already on the listing being edited.
struct PickedPhoto: Identifiable, Equatable {
    let id: String
    let data: Data?
    let preview: UIImage?
    let remote: ImageAttachment?

    init(data: Data, preview: UIImage) {
        id = UUID().uuidString
        self.data = data
        self.preview = preview
        remote = nil
    }

    init(remote: ImageAttachment) {
        id = remote.id
        data = nil
        preview = nil
        self.remote = remote
    }
}

@MainActor
@Observable
final class CreateListingViewModel {
    var kind: ListingKind = .offer
    var category: ListingCategory = .furniture
    var title = ""
    var description = ""
    var priceText = ""
    var photos: [PickedPhoto] = []
    var busy = false
    var progress: String?
    var error: String?
    let config: MarketConfig
    /// The listing being edited; nil when posting a new one. Kind and location cannot change.
    let editing: Listing?
    var isEditing: Bool { editing != nil }

    private let api: APIClient
    private let uploader: ImageUploader
    private let location: LocationService

    init(api: APIClient, location: LocationService, config: MarketConfig, editing: Listing? = nil) {
        self.api = api
        self.uploader = ImageUploader(api: api)
        self.location = location
        self.config = config
        self.editing = editing
        if let editing {
            kind = editing.kind
            category = editing.category
            title = editing.title
            description = editing.description
            priceText = Money.editText(cents: editing.priceCents)
            photos = editing.images.map { PickedPhoto(remote: $0) }
        }
    }

    var priceCents: Int? { Money.parse(priceText) }
    var problem: String? { ListingValidation.validate(title: title, description: description, priceCents: priceCents, config: config) }
    var canAddPhoto: Bool { photos.count < config.maxImages }

    func addPhoto(_ data: Data) {
        guard canAddPhoto, let preview = UIImage(data: data) else { return }
        photos.append(PickedPhoto(data: data, preview: preview))
    }

    func removePhoto(_ id: String) {
        photos.removeAll { $0.id == id }
    }

    /// Uploads the photos one by one, then posts the listing at the current position.
    func submit() async -> Listing? {
        guard problem == nil, let priceCents, !busy else { return nil }
        busy = true
        error = nil
        defer { busy = false; progress = nil }
        if let editing { return await save(editing, priceCents: priceCents) }
        var fix = location.latestFix
        if fix == nil {
            progress = "Finding your location…"
            fix = await location.awaitFix()
        }
        guard let fix else {
            error = "We need your location to place the listing. Move outdoors and try again."
            return nil
        }
        do {
            var mediaIds: [String] = []
            for (index, photo) in photos.enumerated() {
                guard let data = photo.data else { continue }
                progress = "Uploading photo \(index + 1) of \(photos.count)…"
                mediaIds.append(try await uploader.upload(data).id)
            }
            progress = "Posting…"
            let body = CreateListingRequest(
                kind: kind.rawValue,
                category: category.rawValue,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                priceCents: priceCents,
                mediaIds: mediaIds,
                lat: fix.lat,
                lng: fix.lng,
                accuracy: fix.accuracyM,
                mocked: fix.mocked
            )
            let listing: Listing = try await api.send(try APIRequest(.POST, "market/listings", json: body))
            return listing
        } catch {
            self.error = error.userMessage
            return nil
        }
    }

    /// Uploads the photos that are new, then sends the whole photo list so the server keeps the order.
    private func save(_ listing: Listing, priceCents: Int) async -> Listing? {
        do {
            var mediaIds: [String] = []
            let uploads = photos.filter { $0.remote == nil }.count
            var uploaded = 0
            for photo in photos {
                if let remote = photo.remote {
                    mediaIds.append(remote.id)
                } else if let data = photo.data {
                    uploaded += 1
                    progress = "Uploading photo \(uploaded) of \(uploads)…"
                    mediaIds.append(try await uploader.upload(data).id)
                }
            }
            progress = "Saving…"
            let body = UpdateListingRequest(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                category: category.rawValue,
                priceCents: priceCents,
                mediaIds: mediaIds
            )
            let updated: Listing = try await api.send(try APIRequest(.PATCH, "market/listings/\(listing.id)", json: body))
            return updated
        } catch {
            self.error = error.userMessage
            return nil
        }
    }
}
