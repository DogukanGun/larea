import Foundation
import Observation

/// Plain WebSocket client for `/ws`: bearer auth on the upgrade, exponential reconnect,
/// token refresh on 401 / "account deleted" closes, acks matched to requests by reqId.
@MainActor
@Observable
final class RealtimeClient {
    private(set) var state: ConnectionState = .disconnected
    /// Single consumer (the chat view model). Set before `connect()`.
    var onEvent: (@MainActor (ServerEvent) -> Void)?

    private let url: URL
    private let tokens: any TokenProviding
    private let decoder = JSONDecoder()
    private var task: URLSessionWebSocketTask?
    private var loop: Task<Void, Never>?
    private var wanted = false
    private var counter = 0
    private var pending: [String: CheckedContinuation<ServerEvent.Ack, Never>] = [:]
    private var openSignal: CheckedContinuation<Void, Never>?

    init(url: URL, tokens: any TokenProviding) {
        self.url = url
        self.tokens = tokens
    }

    func connect() {
        guard !wanted else { return }
        wanted = true
        loop = Task { await runLoop() }
    }

    func disconnect() {
        wanted = false
        loop?.cancel()
        loop = nil
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        failPending(reason: "disconnected")
        state = .disconnected
    }

    func join(venueId: String) async -> ServerEvent.Ack {
        await request(["type": "join", "venueId": venueId])
    }

    func leave(venueId: String) async -> ServerEvent.Ack {
        await request(["type": "leave", "venueId": venueId])
    }

    func heartbeat(venueId: String, lat: Double, lng: Double, accuracy: Double, mocked: Bool) async -> HeartbeatAck {
        let ack = await request(["type": "heartbeat", "venueId": venueId, "lat": lat, "lng": lng, "accuracy": accuracy, "mocked": mocked])
        return HeartbeatAck(
            ok: ack.ok,
            state: ack.data?["state"]?.stringValue,
            removed: ack.data?["removed"]?.boolValue ?? false,
            reason: ack.reason
        )
    }

    /// Waits until connected, or returns false after the timeout.
    func awaitConnected(timeout: Duration = .seconds(10)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while state != .connected && ContinuousClock.now < deadline {
            try? await Task.sleep(for: .milliseconds(100))
        }
        return state == .connected
    }

    // MARK: - Requests

    private func request(_ fields: [String: Any], timeout: Duration = .seconds(8)) async -> ServerEvent.Ack {
        counter += 1
        let reqId = "r\(counter)"
        var payload = fields
        payload["reqId"] = reqId
        guard let task, state == .connected,
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8)
        else { return ServerEvent.Ack(reqId: reqId, ok: false, reason: "not_connected", data: nil) }

        do {
            try await task.send(.string(text))
        } catch {
            return ServerEvent.Ack(reqId: reqId, ok: false, reason: "send_failed", data: nil)
        }
        return await withCheckedContinuation { continuation in
            pending[reqId] = continuation
            Task { [weak self] in
                try? await Task.sleep(for: timeout)
                await self?.resolve(reqId: reqId, with: ServerEvent.Ack(reqId: reqId, ok: false, reason: "timeout", data: nil))
            }
        }
    }

    private func resolve(reqId: String, with ack: ServerEvent.Ack) {
        guard let continuation = pending.removeValue(forKey: reqId) else { return }
        continuation.resume(returning: ack)
    }

    private func failPending(reason: String) {
        for (reqId, continuation) in pending { continuation.resume(returning: ServerEvent.Ack(reqId: reqId, ok: false, reason: reason, data: nil)) }
        pending.removeAll()
    }

    // MARK: - Connection loop

    private enum Outcome { case unauthorized, suspended, other }

    private func runLoop() async {
        var attempt = 0
        while wanted && !Task.isCancelled {
            guard let token = await tokens.accessToken() else {
                state = .disconnected
                try? await Task.sleep(for: .seconds(2))
                continue
            }
            state = .connecting
            let outcome = await openAndPump(token: token)
            switch outcome {
            case .unauthorized:
                if await tokens.refresh(stale: token) == nil {
                    wanted = false
                    state = .disconnected
                    return
                }
                attempt = 0
            case .suspended:
                state = .suspended
                wanted = false
                return
            case .other:
                state = .disconnected
                guard wanted else { return }
                attempt += 1
                try? await Task.sleep(for: .seconds(reconnectDelay(attempt: attempt)))
            }
        }
    }

    private func openAndPump(token: String) async -> Outcome {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let delegate = SocketDelegate(
            onOpen: { [weak self] in Task { @MainActor in self?.state = .connected } },
            onClose: { _, _ in }
        )
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()

        while true {
            do {
                let message = try await task.receive()
                switch message {
                case let .string(text): handle(text)
                case let .data(data): handle(String(decoding: data, as: UTF8.self))
                @unknown default: break
                }
            } catch {
                break
            }
        }
        failPending(reason: "closed")
        self.task = nil

        if let http = task.response as? HTTPURLResponse {
            if http.statusCode == 401 { return .unauthorized }
            if http.statusCode == 403 { return .suspended }
        }
        let reason = task.closeReason.map { String(decoding: $0, as: UTF8.self) } ?? ""
        if reason.contains("suspended") { return .suspended }
        if reason.contains("account deleted") || reason.contains("unauthorized") { return .unauthorized }
        return .other
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8), let event = try? decoder.decode(ServerEvent.self, from: data) else { return }
        if case let .ack(ack) = event, let reqId = ack.reqId { resolve(reqId: reqId, with: ack) }
        onEvent?(event)
    }
}

private final class SocketDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    private let onOpen: @Sendable () -> Void
    private let onClose: @Sendable (URLSessionWebSocketTask.CloseCode, Data?) -> Void

    init(onOpen: @escaping @Sendable () -> Void, onClose: @escaping @Sendable (URLSessionWebSocketTask.CloseCode, Data?) -> Void) {
        self.onOpen = onOpen
        self.onClose = onClose
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        onOpen()
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        onClose(closeCode, reason)
    }
}
