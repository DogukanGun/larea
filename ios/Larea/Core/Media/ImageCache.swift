import UIKit

/// Downloads images once and keeps them in memory (and on disk through URLCache, which honours
/// the server's immutable cache headers). Concurrent requests for one URL share a download.
actor ImageCache {
    static let shared = ImageCache()

    private let memory = NSCache<NSURL, UIImage>()
    private var inFlight: [URL: Task<UIImage, Error>] = [:]
    private let session: URLSession

    init() {
        memory.countLimit = 300
        memory.totalCostLimit = 80 * 1024 * 1024
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 30 * 1024 * 1024, diskCapacity: 200 * 1024 * 1024)
        config.requestCachePolicy = .returnCacheDataElseLoad
        session = URLSession(configuration: config)
    }

    func image(for url: URL) async throws -> UIImage {
        if let cached = memory.object(forKey: url as NSURL) { return cached }
        if let running = inFlight[url] { return try await running.value }
        let task = Task<UIImage, Error> {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), let image = UIImage(data: data) else {
                throw URLError(.cannotDecodeContentData)
            }
            return image
        }
        inFlight[url] = task
        defer { inFlight[url] = nil }
        let image = try await task.value
        memory.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4))
        return image
    }

    func removeAll() {
        memory.removeAllObjects()
    }
}
