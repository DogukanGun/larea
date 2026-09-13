import Foundation

/// Single-flight refresh: concurrent callers that saw the same stale token share one request.
actor TokenRefresher: TokenProviding {
    private let baseURL: URL
    private let store: SessionStore
    private var inFlight: Task<String?, Never>?

    init(baseURL: URL, store: SessionStore) {
        self.baseURL = baseURL
        self.store = store
    }

    func accessToken() async -> String? {
        await store.session?.accessToken
    }

    func refresh(stale: String?) async -> String? {
        if let inFlight { return await inFlight.value }
        let task = Task<String?, Never> { await self.performRefresh(stale: stale) }
        inFlight = task
        let result = await task.value
        inFlight = nil
        return result
    }

    private func performRefresh(stale: String?) async -> String? {
        guard let session = await store.session else { return nil }
        if let stale, session.accessToken != stale { return session.accessToken }

        var request = URLRequest(url: baseURL.appending(path: "auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(RefreshRequest(refreshToken: session.refreshToken))
        guard let (data, response) = try? await URLSession.shared.data(for: request), let http = response as? HTTPURLResponse else {
            return session.accessToken // transient failure: keep using the old token
        }
        if http.statusCode == 401 {
            await store.clear()
            return nil
        }
        guard (200..<300).contains(http.statusCode), let result = try? JSONDecoder().decode(AuthResult.self, from: data) else {
            return session.accessToken
        }
        await store.save(Session(accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user))
        return result.accessToken
    }
}
