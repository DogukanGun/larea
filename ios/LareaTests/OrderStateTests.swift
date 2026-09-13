import XCTest
@testable import Larea

final class OrderStateTests: XCTestCase {
    func testPrimaryActions() {
        XCTAssertEqual(OrderState.primary(status: .awaitingPayment, role: .payer), .pay)
        XCTAssertNil(OrderState.primary(status: .awaitingPayment, role: .payee))
        XCTAssertEqual(OrderState.primary(status: .paid, role: .payee), .approveHandover)
        XCTAssertNil(OrderState.primary(status: .paid, role: .payer))
        for status in [OrderStatus.completed, .cancelled, .refunded, .disputed, .unknown] {
            XCTAssertNil(OrderState.primary(status: status, role: .payer))
            XCTAssertNil(OrderState.primary(status: status, role: .payee))
        }
    }

    func testSecondaryActions() {
        XCTAssertEqual(OrderState.secondary(status: .awaitingPayment, role: .payer), [.cancel])
        XCTAssertEqual(OrderState.secondary(status: .awaitingPayment, role: .payee), [.cancel])
        XCTAssertEqual(OrderState.secondary(status: .paid, role: .payer), [.cancelAndRefund])
        XCTAssertEqual(OrderState.secondary(status: .paid, role: .payee), [.cancel])
        XCTAssertEqual(OrderState.secondary(status: .completed, role: .payer), [])
        XCTAssertEqual(OrderState.secondary(status: .disputed, role: .payee), [])
    }

    func testStepsAndWaitingText() {
        XCTAssertEqual(OrderState.stepIndex(.awaitingPayment), 0)
        XCTAssertEqual(OrderState.stepIndex(.paid), 1)
        XCTAssertEqual(OrderState.stepIndex(.completed), 3)
        XCTAssertNil(OrderState.stepIndex(.refunded))
        XCTAssertEqual(OrderState.waitingText(status: .awaitingPayment, role: .payee, counterpart: "ben"), "Waiting for ben to pay.")
        XCTAssertNil(OrderState.waitingText(status: .completed, role: .payer, counterpart: "ben"))
    }
}
