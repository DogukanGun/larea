import Foundation
import Observation
import UIKit

struct PickedPhoto: Identifiable, Equatable {
    let id = UUID()
    let data: Data
    let preview: UIImage
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

    private let api: APIClient
    private let uploader: ImageUploader
    private let location: LocationService

    init(api: APIClient, location: LocationService, config: MarketConfig) {
        self.api = api
        self.uploader = ImageUploader(api: api)
        self.location = location
        self.config = config
    }

    var priceCents: Int? { Money.parse(priceText) }
    var problem: String? { ListingValidation.validate(title: title, description: description, priceCents: priceCents, config: config) }
    var canAddPhoto: Bool { photos.count < config.maxImages }

    func addPhoto(_ data: Data) {
        guard canAddPhoto, let preview = UIImage(data: data) else { return }
        photos.append(PickedPhoto(data: data, preview: preview))
    }

    func removePhoto(_ id: UUID) {
        photos.removeAll { $0.id == id }
    }

    /// Uploads the photos one by one, then posts the listing at the current position.
    func submit() async -> Listing? {
        guard problem == nil, let priceCents, !busy else { return nil }
        busy = true
        error = nil
        defer { busy = false; progress = nil }
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
                progress = "Uploading photo \(index + 1) of \(photos.count)…"
                mediaIds.append(try await uploader.upload(photo.data).id)
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
}
