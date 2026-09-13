import DeclaredAgeRange
import Foundation
import Observation

@MainActor
@Observable
final class VerificationViewModel {
    enum Outcome: Equatable {
        case declined, underAge, unknownAge, unavailable, failed(String)
    }

    var busy = false
    var status: VerificationStatus?
    var outcome: Outcome?

    private let api: APIClient
    private let sessions: SessionRepository

    init(api: APIClient, sessions: SessionRepository) {
        self.api = api
        self.sessions = sessions
    }

    func refreshStatus() async {
        if let status: VerificationStatus = try? await api.send(APIRequest(.GET, "verification/status")) {
            self.status = status
        }
    }

    /// Forwards Apple's age-range answer. Only the range bounds and the declaration kind leave the device.
    func submit(_ response: AgeRangeService.Response) async {
        switch response {
        case .declinedSharing:
            await send(PlatformAgeRequest(platform: "apple", lowerBound: nil, upperBound: nil, declaration: "unknown"))
        case let .sharing(range):
            let declaration: String
            switch range.ageRangeDeclaration {
            case .selfDeclared: declaration = "self"
            case .guardianDeclared: declaration = "guardian"
            case .some: declaration = "confirmed" // any platform-confirmed variant
            case .none: declaration = "unknown"
            }
            await send(PlatformAgeRequest(platform: "apple", lowerBound: range.lowerBound, upperBound: range.upperBound, declaration: declaration))
        @unknown default:
            outcome = .unavailable
        }
    }

    func report(_ error: Error) {
        if let serviceError = error as? AgeRangeService.Error, serviceError == .notAvailable {
            outcome = .unavailable
        } else {
            outcome = .failed(error.userMessage)
        }
    }

    #if DEBUG
    /// UI tests: the backend's test-only shortcut (only exists when the backend runs with NODE_ENV=test).
    func passForTests() async {
        busy = true
        defer { busy = false }
        do {
            let status: VerificationStatus = try await api.send(APIRequest(.POST, "testing/verify-age"))
            self.status = status
            await sessions.refreshMe()
        } catch {
            outcome = .failed(error.userMessage)
        }
    }
    #endif

    private func send(_ request: PlatformAgeRequest) async {
        busy = true
        defer { busy = false }
        do {
            let result: VerificationStatus = try await api.send(try APIRequest(.POST, "verification/platform", json: request))
            status = result
            switch result.reason {
            case "under_age": outcome = .underAge
            case "declined": outcome = .declined
            case "unknown_age": outcome = .unknownAge
            default: outcome = nil
            }
            if result.verified { await sessions.refreshMe() }
        } catch {
            outcome = .failed(error.userMessage)
        }
    }
}
