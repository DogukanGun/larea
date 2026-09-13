import Foundation

struct APIRequest: Sendable {
    enum Method: String, Sendable { case GET, POST, PATCH, DELETE }
    var method: Method
    var path: String
    var query: [URLQueryItem] = []
    var body: Data? = nil
    var authenticated: Bool = true
    /// Defaults to JSON when a body is present.
    var contentType: String? = nil
    var timeout: TimeInterval = 20

    init(_ method: Method, _ path: String, query: [URLQueryItem] = [], authenticated: Bool = true) {
        self.method = method
        self.path = path
        self.query = query
        self.authenticated = authenticated
    }

    init<B: Encodable>(_ method: Method, _ path: String, json body: B, authenticated: Bool = true) throws {
        self.init(method, path, authenticated: authenticated)
        self.body = try JSONEncoder().encode(body)
    }

    /// A file upload; gets a generous timeout because photos go over mobile networks.
    init(_ method: Method, _ path: String, multipart parts: [MultipartPart], authenticated: Bool = true) {
        self.init(method, path, authenticated: authenticated)
        let boundary = Multipart.boundary()
        body = Multipart.encode(parts, boundary: boundary)
        contentType = "multipart/form-data; boundary=\(boundary)"
        timeout = 90
    }

    var isUpload: Bool { contentType?.hasPrefix("multipart/") == true }
}

/// Typed access to the REST API. On 401 it refreshes the access token once and retries.
actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokens: any TokenProviding
    private let decoder = JSONDecoder()

    init(baseURL: URL, tokens: any TokenProviding, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
    }

    func send<T: Decodable & Sendable>(_ request: APIRequest, as type: T.Type = T.self) async throws -> T {
        let data = try await perform(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    func sendNoContent(_ request: APIRequest) async throws {
        _ = try await perform(request)
    }

    private func perform(_ request: APIRequest) async throws -> Data {
        var token = request.authenticated ? await tokens.accessToken() : nil
        if request.authenticated && token == nil { throw APIError.unauthenticated }

        var attempt = 0
        while true {
            attempt += 1
            let (data, response) = try await execute(request, token: token)
            if response.statusCode == 401, request.authenticated, attempt == 1 {
                guard let fresh = await tokens.refresh(stale: token) else { throw APIError.unauthenticated }
                token = fresh
                continue
            }
            if (200..<300).contains(response.statusCode) { return data }
            let body = (try? decoder.decode(APIErrorBody.self, from: data)) ?? APIErrorBody(code: "HTTP_\(response.statusCode)")
            throw APIError.api(code: body.code, message: body.message, status: response.statusCode, mutedUntil: body.mutedUntil, retryAfterSec: body.retryAfterSec)
        }
    }

    private func execute(_ request: APIRequest, token: String?) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(url: baseURL.appending(path: request.path), resolvingAgainstBaseURL: false)!
        if !request.query.isEmpty { components.queryItems = request.query }
        var urlRequest = URLRequest(url: components.url!)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.timeoutInterval = request.timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if request.body != nil {
            urlRequest.setValue(request.contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token { urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        do {
            let (data, response): (Data, URLResponse)
            if let body = request.body, request.isUpload {
                (data, response) = try await session.upload(for: urlRequest, from: body)
            } else {
                urlRequest.httpBody = request.body
                (data, response) = try await session.data(for: urlRequest)
            }
            guard let http = response as? HTTPURLResponse else { throw APIError.network(underlying: "not http") }
            return (data, http)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(underlying: error.localizedDescription)
        }
    }
}

/// Read and refresh access tokens (implemented by TokenRefresher; faked in tests).
protocol TokenProviding: Sendable {
    func accessToken() async -> String?
    func refresh(stale: String?) async -> String?
}
