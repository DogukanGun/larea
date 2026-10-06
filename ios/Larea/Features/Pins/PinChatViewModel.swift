import Foundation
import Observation

/// One message pin: its pinned message on top and the chat under it. Its owner runs the chat.
@MainActor
@Observable
final class PinChatViewModel {
    let pinId: String
    var pin: MessagePin?
    var messages: [PinMessage] = []
    var draft = ""
    var loading = false
    var sending = false
    var error: String?
    var notice: String?
    /// Set when the pin went away (expired, removed, or the owner removed us).
    var closedMessage: String?

    private let api: APIClient
    private let realtime: RealtimeClient
    private let location: LocationService
    private var subscription: EventSubscription?
    private var stateWatch: Task<Void, Never>?
    private var followed = false

    init(pinId: String, api: APIClient, realtime: RealtimeClient, location: LocationService) {
        self.pinId = pinId
        self.api = api
        self.realtime = realtime
        self.location = location
    }

    var canChat: Bool { pin?.canChat == true && closedMessage == nil }
    var isOwner: Bool { pin?.mine == true }

    private var fixQuery: [URLQueryItem] {
        guard let fix = location.latestFix else { return [] }
        return [
            URLQueryItem(name: "lat", value: String(fix.lat)),
            URLQueryItem(name: "lng", value: String(fix.lng)),
            URLQueryItem(name: "accuracy", value: String(fix.accuracyM)),
        ]
    }

    private var fixBody: LocationFixBody? {
        location.latestFix.map { LocationFixBody(lat: $0.lat, lng: $0.lng, accuracy: $0.accuracyM, mocked: $0.mocked) }
    }

    func start() {
        subscription = realtime.addObserver { [weak self] event in self?.handle(event) }
        // Follow again after every reconnect: the server forgets subscriptions with the socket.
        stateWatch = Task { [weak self] in
            var last = ConnectionState.disconnected
            while !Task.isCancelled {
                guard let self else { return }
                let now = self.realtime.state
                if now == .connected, last != .connected { await self.follow() }
                last = now
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
        Task { await load() }
    }

    func stop() {
        if let subscription { realtime.removeObserver(subscription) }
        subscription = nil
        stateWatch?.cancel()
        stateWatch = nil
        if followed { Task { [realtime, pinId] in await realtime.unsubscribePin(pinId: pinId) } }
        followed = false
    }

    func load() async {
        loading = true
        defer { loading = false }
        do {
            pin = try await api.send(APIRequest(.GET, "pins/\(pinId)", query: fixQuery))
            guard canChat else { return }
            let response: PinMessagesResponse = try await api.send(APIRequest(.GET, "pins/\(pinId)/messages", query: fixQuery))
            messages = response.messages
            await follow()
        } catch let error as APIError where error.status == 404 {
            closedMessage = error.userMessage
        } catch {
            self.error = error.userMessage
        }
    }

    private func follow() async {
        guard canChat, realtime.state == .connected else { return }
        let fix = location.latestFix
        let ack = await realtime.subscribePin(pinId: pinId, lat: fix?.lat ?? 0, lng: fix?.lng ?? 0, accuracy: fix?.accuracyM ?? 0, mocked: fix?.mocked ?? false)
        followed = ack.ok
        if ack.ok, let last = messages.last {
            // Fill the gap while we were away.
            if let response: PinMessagesResponse = try? await api.send(APIRequest(.GET, "pins/\(pinId)/messages", query: fixQuery + [URLQueryItem(name: "afterId", value: last.id)])) {
                for message in response.messages where !messages.contains(where: { $0.id == message.id }) { messages.append(message) }
            }
        }
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            let body = SendPinMessageRequest(text: text, clientKey: UUID().uuidString, fix: fixBody)
            let result: PinSendResult = try await api.send(try APIRequest(.POST, "pins/\(pinId)/messages", json: body))
            draft = ""
            if let message = result.message, !messages.contains(where: { $0.id == message.id }) { messages.append(message) }
            notice = result.notice
        } catch {
            self.error = error.userMessage
        }
    }

    // MARK: - Owner tools

    func hide(_ message: PinMessage) async {
        do {
            try await api.sendNoContent(APIRequest(.POST, "pins/\(pinId)/messages/\(message.id)/hide"))
            messages.removeAll { $0.id == message.id }
        } catch {
            self.error = error.userMessage
        }
    }

    func removeFromChat(_ author: Author) async {
        do {
            try await api.sendNoContent(try APIRequest(.POST, "pins/\(pinId)/bans", json: BanUserRequest(userId: author.id)))
            messages.removeAll { $0.author.id == author.id }
            notice = "\(author.displayName) can no longer join this chat."
        } catch {
            self.error = error.userMessage
        }
    }

    func edit(_ text: String) async -> Bool {
        do {
            let updated: MessagePin = try await api.send(try APIRequest(.PATCH, "pins/\(pinId)", json: PinTextRequest(text: text)))
            pin?.text = updated.text
            pin?.editedAt = updated.editedAt
            return true
        } catch {
            self.error = error.userMessage
            return false
        }
    }

    // MARK: - Reports

    func report(_ message: PinMessage, reason: String) async {
        do {
            try await api.sendNoContent(try APIRequest(.POST, "pin-messages/\(message.id)/reports", json: PinReportRequest(reason: reason)))
            notice = "Thanks. Our moderators will take a look."
        } catch {
            self.error = error.userMessage
        }
    }

    func reportPin(reason: String) async {
        do {
            try await api.sendNoContent(try APIRequest(.POST, "pins/\(pinId)/reports", json: PinReportRequest(reason: reason)))
            notice = "Thanks. Our moderators will take a look."
        } catch {
            self.error = error.userMessage
        }
    }

    private func handle(_ event: ServerEvent) {
        switch event {
        case let .pinMessage(message) where message.pinId == pinId:
            if !messages.contains(where: { $0.id == message.id }) { messages.append(message) }
        case let .pinMessageHidden(id, messageId) where id == pinId:
            messages.removeAll { $0.id == messageId }
        case let .pinUpdated(id, text, editedAt) where id == pinId:
            pin?.text = text
            pin?.editedAt = editedAt
        case let .pinClosed(id, _, message) where id == pinId:
            followed = false
            closedMessage = message
        default:
            break
        }
    }
}
