import XCTest
@testable import Larea

final class AppRouterTests: XCTestCase {
    func testParsesCheckoutReturns() {
        XCTAssertEqual(DeepLink.parse(URL(string: "larea://market/order/abc-123?checkout=success")!), .orderCheckout(orderId: "abc-123", success: true))
        XCTAssertEqual(DeepLink.parse(URL(string: "larea://market/order/abc-123?checkout=cancel")!), .orderCheckout(orderId: "abc-123", success: false))
        XCTAssertEqual(DeepLink.parse(URL(string: "larea://market/stripe/return?status=complete")!), .stripeReturn)
    }

    func testRejectsForeignLinks() {
        XCTAssertNil(DeepLink.parse(URL(string: "https://larea.dogukangundogan.com/market/order/1")!))
        XCTAssertNil(DeepLink.parse(URL(string: "larea://chat/1")!))
        XCTAssertNil(DeepLink.parse(URL(string: "larea://market/order")!))
    }

    @MainActor
    func testDeepLinksSwitchTabsAndPaths() {
        let router = AppRouter()
        router.handle(URL(string: "larea://market/order/o1?checkout=success")!, ready: false)
        XCTAssertEqual(router.tab, .nearby)
        router.drainPending()
        XCTAssertEqual(router.tab, .deals)
        XCTAssertEqual(router.dealsPath, [.order("o1")])
        XCTAssertEqual(router.checkoutResult?.orderId, "o1")
        XCTAssertEqual(router.checkoutResult?.success, true)

        router.handle(URL(string: "larea://market/stripe/return")!)
        XCTAssertEqual(router.tab, .profile)
        XCTAssertEqual(router.profilePath, [.payouts])
        XCTAssertEqual(router.stripeReturnCount, 1)

        router.reset()
        XCTAssertEqual(router.tab, .nearby)
        XCTAssertTrue(router.dealsPath.isEmpty && router.profilePath.isEmpty)
    }
}
