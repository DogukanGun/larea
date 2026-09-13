import Foundation

enum OrderRole: Equatable { case payer, payee }

enum OrderAction: Equatable {
    case pay, cancel, approveHandover, cancelAndRefund

    var title: String {
        switch self {
        case .pay: return "Pay now"
        case .cancel: return "Cancel deal"
        case .approveHandover: return "Confirm handover"
        case .cancelAndRefund: return "Cancel and refund"
        }
    }
}

/// Which buttons a deal shows, by status and side. Pure, so it is unit-tested.
enum OrderState {
    static func role(of order: Order, myId: String?) -> OrderRole {
        if let myId, order.payee.id == myId { return .payee }
        return order.isPayer ? .payer : .payee
    }

    static func primary(status: OrderStatus, role: OrderRole) -> OrderAction? {
        switch (status, role) {
        case (.awaitingPayment, .payer): return .pay
        case (.paid, .payee): return .approveHandover
        default: return nil
        }
    }

    static func secondary(status: OrderStatus, role: OrderRole) -> [OrderAction] {
        switch (status, role) {
        case (.awaitingPayment, _): return [.cancel]
        case (.paid, .payer): return [.cancelAndRefund]
        case (.paid, .payee): return [.cancel]
        default: return []
        }
    }

    static let steps = ["Offer accepted", "Paid", "Handover", "Done"]

    /// Index into `steps`; nil when the deal ended without completing.
    static func stepIndex(_ status: OrderStatus) -> Int? {
        switch status {
        case .awaitingPayment: return 0
        case .paid: return 1
        case .completed: return 3
        case .disputed: return 2
        case .cancelled, .refunded, .unknown: return nil
        }
    }

    static func waitingText(status: OrderStatus, role: OrderRole, counterpart: String) -> String? {
        switch (status, role) {
        case (.awaitingPayment, .payee): return "Waiting for \(counterpart) to pay."
        case (.awaitingPayment, .payer): return "Pay to reserve the deal. The seller only gets the money after the handover."
        case (.paid, .payer): return "Show your handover code to \(counterpart) when you meet. That releases the money."
        case (.paid, .payee): return "Meet \(counterpart), then enter their code to receive the money."
        case (.disputed, _): return "The payment is being reviewed. A moderator will settle this deal."
        default: return nil
        }
    }
}
