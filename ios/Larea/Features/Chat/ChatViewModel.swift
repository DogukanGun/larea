import Foundation
import Observation

struct PendingMessage: Identifiable, Equatable {
    let id: String
    let text: String
}

@MainActor
@Observable
final class ChatViewModel {
    let venueId: String
    var messages: [ChatMessage] = []
    var pending: [PendingMessage] = []
    var presence = 0
    var connection: ConnectionState = .disconnected
    var weakGps = false
    var mutedUntil: Date?
    var removed: String?
    var notice: String?
    var notices: [SystemNotice] = []
    var sentCount = 0
    var removedCount = 0
    var left = false
    var loading = true
    var myUserId: String?

    private let api: APIClient
    private let realtime: RealtimeClient
    private let location: LocationService
    private let session: SessionStore
    private var heartbeatIntervalSec = 25
    private var tasks: [Task<Void, Never>] = []
    private var started = false
    private var lastConnection: ConnectionState = .disconnected
    private var subscription: EventSubscription?

    init(venueId: String, api: APIClient, realtime: RealtimeClient, location: LocationService, session: SessionStore) {
        self.venueId = venueId
        self.api = api
        self.realtime = realtime
        self.location = location
        self.session = session
    }

    func start() {
        guard !started else { return }
        started = true
        myUserId = session.session?.user.id
        if let iso = session.session?.user.mutedUntil, let date = ISO8601DateFormatter.larea.date(from: iso), date > .now { mutedUntil = date }
        location.start()
        subscription = realtime.addObserver { [weak self] event in self?.handle(event) }
        realtime.connect()
        tasks = [
            Task { await self.loadHistory() },
            Task { await self.watchConnection() },
            Task { await self.heartbeatLoop() },
        ]
    }

    /// Ends this chat session. The socket stays open: other screens (members, deals) use it too.
    func stop() {
        tasks.forEach { $0.cancel() }
        tasks = []
        if let subscription { realtime.removeObserver(subscription) }
        subscription = nil
        started = false
        lastConnection = .disconnected
    }

    // MARK: - Connection and presence

    private func watchConnection() async {
        while !Task.isCancelled {
            let state = realtime.state
            if state != lastConnection {
                lastConnection = state
                connection = state
                if state == .connected { await onConnected() }
            }
            try? await Task.sleep(for: .milliseconds(200))
        }
    }

    private func onConnected() async {
        let ack = await realtime.join(venueId: venueId)
        if !ack.ok, ack.reason == "not_member" {
            await rejoin()
            return
        }
        if let count = ack.data?["memberCount"]?.intValue { presence = count }
        if let interval = ack.data?["timing"]?.objectValue?["heartbeatIntervalSec"]?.intValue { heartbeatIntervalSec = interval }
        await sendHeartbeat()
        if let lastId = messages.last?.id,
           let gap: HistoryResponse = try? await api.send(APIRequest(.GET, "venues/\(venueId)/messages", query: [URLQueryItem(name: "afterId", value: lastId)])) {
            gap.messages.forEach(add)
        }
    }

    private func heartbeatLoop() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(heartbeatIntervalSec))
            if Task.isCancelled { return }
            await sendHeartbeat()
        }
    }

    private func sendHeartbeat() async {
        guard connection == .connected, let fix = location.latestFix else { return }
        let ack = await realtime.heartbeat(venueId: venueId, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM, mocked: fix.mocked)
        if !ack.ok, ack.reason == "not_member" {
            await rejoin()
            return
        }
        weakGps = ack.state == "weak_gps"
    }

    /// Silent rejoin after a quiet period; gives up with the server's message.
    private func rejoin() async {
        var current = location.latestFix
        if current == nil { current = await location.awaitFix() }
        guard let fix = current else {
            removed = "We couldn't confirm your location."
            removedCount += 1
            return
        }
        do {
            let body = LocationFixBody(lat: fix.lat, lng: fix.lng, accuracy: fix.accuracyM, mocked: fix.mocked)
            let _: JoinResult = try await api.send(try APIRequest(.POST, "venues/\(venueId)/join", json: body))
            if connection == .connected { _ = await realtime.join(venueId: venueId) }
            await loadHistory()
        } catch {
            removed = error.userMessage
            removedCount += 1
        }
    }

    // MARK: - Messages

    private func loadHistory() async {
        do {
            let history: HistoryResponse = try await api.send(APIRequest(.GET, "venues/\(venueId)/messages"))
            messages = history.messages
            loading = false
        } catch {
            loading = false
            if (error as? APIError)?.code == "NOT_MEMBER" { await rejoin() } else { notice = error.userMessage }
        }
    }

    private func handle(_ event: ServerEvent) {
        switch event {
        case let .message(message) where message.venueId == venueId: add(message)
        case let .messageHidden(_, messageId): messages.removeAll { $0.id == messageId }
        case let .presence(id, count) where id == venueId: presence = count
        case let .enforcement(kind, until, message):
            if kind == "mute", let until, let date = ISO8601DateFormatter.larea.date(from: until) { mutedUntil = date }
            addNotice(.info, message)
        case let .removed(id, reason, message) where id == venueId:
            switch reason {
            case "stale": Task { await rejoin() }
            case "replaced", "user_left": left = true
            default:
                removed = message
                removedCount += 1
            }
        default: break
        }
    }

    private func add(_ message: ChatMessage) {
        guard !messages.contains(where: { $0.id == message.id }) else { return }
        messages.append(message)
        messages.sort { $0.createdAt < $1.createdAt }
    }

    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let item = PendingMessage(id: UUID().uuidString, text: trimmed)
        pending.append(item)
        defer { pending.removeAll { $0.id == item.id } }
        do {
            let result: SendResult = try await api.send(try APIRequest(.POST, "venues/\(venueId)/messages", json: SendMessageRequest(text: trimmed, clientKey: item.id)))
            if let message = result.message { add(message) }
            switch result.status {
            case "blocked": addNotice(.blocked, result.notice ?? "This message doesn't meet our community guidelines.")
            case "censored":
                sentCount += 1
                addNotice(.censored, result.notice ?? "Part of your message was masked.")
            default:
                sentCount += 1
                if let notice = result.notice { addNotice(.warned, notice) }
            }
        } catch {
            if let apiError = error as? APIError {
                if apiError.code == "MUTED", let iso = apiError.mutedUntil { mutedUntil = ISO8601DateFormatter.larea.date(from: iso) }
                if apiError.code == "NOT_PRESENT" { await rejoin() }
            }
            notice = error.userMessage
        }
    }

    func report(_ message: ChatMessage, reason: String) async {
        do {
            try await api.sendNoContent(try APIRequest(.POST, "messages/\(message.id)/reports", json: CreateReportRequest(reason: reason, details: nil)))
            notice = "Thanks, your report was sent."
        } catch {
            notice = error.userMessage
        }
    }

    func block(_ author: Author) async {
        do {
            try await api.sendNoContent(APIRequest(.POST, "users/\(author.id)/block"))
            messages.removeAll { $0.author.id == author.id }
            notice = "\(author.displayName) is blocked."
        } catch {
            notice = error.userMessage
        }
    }

    func leave() async {
        try? await api.sendNoContent(APIRequest(.POST, "venues/\(venueId)/leave"))
        left = true
    }

    var isMuted: Bool { (mutedUntil ?? .distantPast) > .now }

    private func addNotice(_ kind: SystemNotice.Kind, _ text: String) {
        notices.append(SystemNotice(id: UUID().uuidString, kind: kind, text: text))
        if notices.count > 5 { notices.removeFirst(notices.count - 5) }
    }
}

extension Date {
    /// "13:00" today, otherwise "Tomorrow 13:00" / "Wed 13:00" style.
    var lareaShort: String {
        if Calendar.current.isDateInToday(self) { return formatted(date: .omitted, time: .shortened) }
        if Calendar.current.isDateInTomorrow(self) { return "tomorrow at " + formatted(date: .omitted, time: .shortened) }
        return formatted(.dateTime.weekday(.abbreviated).hour().minute())
    }
}

extension ISO8601DateFormatter {
    /// Parses the backend's `2026-09-06T21:00:00.000Z` timestamps.
    nonisolated(unsafe) static let larea: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
