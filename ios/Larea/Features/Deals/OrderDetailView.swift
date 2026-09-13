import SwiftUI

struct OrderDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    let orderId: String
    @State private var model: OrderDetailViewModel?
    @State private var showCode = false
    @State private var code = ""
    @State private var confirmCancel = false

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationTitle("Deal")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil {
                let created = OrderDetailViewModel(orderId: orderId, api: env.api)
                model = created
                Task { await created.load() }
            }
        }
        .onChange(of: router.checkoutResult) { _, result in
            guard let result, result.orderId == orderId else { return }
            model?.checkoutReturned(success: result.success)
        }
    }

    @ViewBuilder
    private func content(_ model: OrderDetailViewModel) -> some View {
        @Bindable var model = model
        Group {
            if let order = model.order {
                detail(order, model: model)
            } else if let error = model.error {
                ContentUnavailableView { Label("Can't load this deal", systemImage: "wifi.exclamationmark") } description: { Text(error) } actions: {
                    Button("Retry") { Task { await model.load() } }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                }
            } else {
                ProgressView()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let banner = model.banner { Banner(kind: banner.kind, text: banner.text) }
        }
        .sheet(item: $model.safari) { item in
            SafariView(url: item.url, onDone: { model.safari = nil; Task { await model.load() } }).ignoresSafeArea()
        }
        .alert("Deal", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
        .refreshable { await model.load() }
    }

    @ViewBuilder
    private func detail(_ order: Order, model: OrderDetailViewModel) -> some View {
        let role = OrderState.role(of: order, myId: env.session.session?.user.id)
        let failed = order.status == .cancelled || order.status == .refunded || order.status == .disputed
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                Button { router.dealsPath.append(.listing(order.listingId)) } label: {
                    HStack(spacing: Spacing.m) {
                        RemoteImage(url: order.listing.thumbURL).frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.listing.title).font(.lareaHeadline).foregroundStyle(.primary).lineLimit(2)
                            Text(order.listing.kind.label).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(.plain)
                StatusStepper(steps: OrderState.steps, current: OrderState.stepIndex(order.status) ?? (order.status == .refunded ? 1 : 0), failed: failed)
                    .padding(.vertical, Spacing.s)
                HStack(spacing: Spacing.s) {
                    Pill(text: order.status.label, style: failed ? .neutral : (order.status == .completed ? .success : .sunny))
                    if let reason = order.cancelReason, failed { Text(Self.reasonText(reason)).font(.caption).foregroundStyle(.secondary) }
                }
                amountCard(order, role: role)
                HStack(spacing: Spacing.m) {
                    Avatar(name: order.counterpart.displayName, seed: order.counterpart.id, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(order.counterpart.displayName).font(.lareaHeadline)
                        Text(role == .payer ? "Seller" : "Buyer").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if role == .payer, order.status == .paid, let codeText = order.handoverCode {
                    VStack(alignment: .leading, spacing: Spacing.s) {
                        Text("Your handover code").font(.lareaHeadline)
                        Text(codeText.enumerated().map { $0.offset == 3 ? " \($0.element)" : String($0.element) }.joined())
                            .font(.system(size: 40, weight: .heavy, design: .rounded).monospacedDigit())
                            .foregroundStyle(Color.brandPrimary)
                            .accessibilityIdentifier("market.order.code")
                        Text("Show it to \(order.counterpart.displayName) only when you have the item. Entering it pays them.").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(Spacing.l)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.brandTint, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                }
                if let waiting = OrderState.waitingText(status: order.status, role: role, counterpart: order.counterpart.displayName) {
                    NoteCard(symbol: order.status == .disputed ? "exclamationmark.triangle" : "clock", text: waiting)
                }
                timeline(order)
            }
            .padding(Spacing.screen)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) { actions(order, role: role, model: model) }
        .sheet(isPresented: $showCode) {
            NavigationStack {
                VStack(spacing: Spacing.l) {
                    Text("Ask \(order.counterpart.displayName) for the six-digit code on their phone. Entering it releases \(Money.format(cents: order.payoutCents, currency: order.currency)) to you.")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    CodeEntryField(code: $code, identifier: "market.order.codeField")
                    PrimaryButton(title: "Confirm handover", isLoading: model.busy, isEnabled: code.count == 6, identifier: "market.order.approve.confirm") {
                        Task {
                            if await model.approve(code: code) {
                                showCode = false
                                code = ""
                            }
                        }
                    }
                    Spacer()
                }
                .padding(Spacing.screen)
                .navigationTitle("Confirm handover")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showCode = false } } }
            }
            .presentationDetents([.medium])
        }
        .confirmationDialog(role == .payer && order.status == .paid ? "Cancel this deal?" : "Cancel this deal?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button(role == .payer && order.status == .paid ? "Cancel and refund me" : "Cancel deal", role: .destructive) { Task { await model.cancel() } }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text(order.status == .paid ? (role == .payer ? "Your payment goes back to your card and the listing reopens." : "\(order.counterpart.displayName) gets their money back and the listing reopens.") : "The listing reopens for other offers.")
        }
    }

    @ViewBuilder
    private func amountCard(_ order: Order, role: OrderRole) -> some View {
        VStack(spacing: Spacing.s) {
            HStack { Text(role == .payer ? "You pay" : "Buyer pays"); Spacer(); Text(Money.format(cents: order.amountCents, currency: order.currency)).font(.lareaHeadline) }
            if role == .payee {
                HStack { Text("Larea fee").foregroundStyle(.secondary); Spacer(); Text("−\(Money.format(cents: order.feeCents, currency: order.currency))").foregroundStyle(.secondary) }
                Divider()
                HStack { Text("You receive").font(.lareaHeadline); Spacer(); Text(Money.format(cents: order.payoutCents, currency: order.currency)).font(.lareaTitle3).foregroundStyle(Color.brandPrimary) }
            }
        }
        .padding(Spacing.m)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }

    @ViewBuilder
    private func timeline(_ order: Order) -> some View {
        let events: [(String, String?)] = [
            ("Offer accepted", order.createdAt),
            ("Paid", order.paidAt),
            ("Handover confirmed", order.completedAt),
            ("Cancelled", order.cancelledAt),
            ("Refunded", order.refundedAt),
        ]
        VStack(alignment: .leading, spacing: Spacing.s) {
            ForEach(events.filter { $0.1 != nil }, id: \.0) { event in
                HStack {
                    Text(event.0).font(.subheadline)
                    Spacer()
                    Text(Self.dateText(event.1!)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(Spacing.m)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
    }

    @ViewBuilder
    private func actions(_ order: Order, role: OrderRole, model: OrderDetailViewModel) -> some View {
        let primary = OrderState.primary(status: order.status, role: role)
        let secondary = OrderState.secondary(status: order.status, role: role)
        if primary != nil || !secondary.isEmpty {
            VStack(spacing: Spacing.s) {
                if let primary {
                    PrimaryButton(title: primary.title, isLoading: model.busy, identifier: primary == .pay ? "market.order.pay" : "market.order.approve") {
                        switch primary {
                        case .pay: Task { await model.pay() }
                        case .approveHandover: showCode = true
                        default: break
                        }
                    }
                }
                ForEach(secondary, id: \.self) { action in
                    SecondaryButton(title: action.title, identifier: "market.order.cancel") { confirmCancel = true }
                }
            }
            .padding(.horizontal, Spacing.screen)
            .padding(.vertical, Spacing.m)
            .background(.bar)
        }
    }

    private static func dateText(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.larea.date(from: iso) else { return "" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private static func reasonText(_ reason: String) -> String {
        switch reason {
        case "payer_cancelled": return "Cancelled by the buyer"
        case "payee_cancelled": return "Cancelled by the seller"
        case "payment_timeout": return "Payment window closed"
        case "auto_refund": return "No handover in time"
        case "late_payment": return "Paid after cancelling"
        case "listing_removed": return "Listing removed"
        case "moderator": return "Settled by a moderator"
        default: return reason.replacingOccurrences(of: "_", with: " ")
        }
    }
}
