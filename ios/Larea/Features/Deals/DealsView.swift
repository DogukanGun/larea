import SwiftUI

/// Offers and listings the user is part of.
struct DealsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    let model: DealsViewModel

    var body: some View {
        @Bindable var model = model
        Group {
            if env.session.session?.user.capabilities.market != true {
                ContentUnavailableView("No deals yet", systemImage: "tag", description: Text("Offers you make or receive show up here."))
            } else {
                list
            }
        }
        .navigationTitle("Deals")
        .onAppear {
            model.myId = env.session.session?.user.id
            model.start()
        }
        .alert("Deals", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
    }

    private var isEmpty: Bool { model.me.listings.isEmpty && model.me.offersMade.isEmpty && model.me.offersReceived.isEmpty && model.me.orders.isEmpty }

    @ViewBuilder
    private var list: some View {
        List {
            if model.loading, isEmpty {
                Section { ForEach(0..<3, id: \.self) { _ in Text("Loading deals").redacted(reason: .placeholder) } }
            } else if isEmpty {
                ContentUnavailableView("No deals yet", systemImage: "tag", description: Text("Offers you make or receive show up here."))
                    .listRowBackground(Color.clear)
            } else {
                if !model.pendingReceived.isEmpty || !model.ordersNeedingMe.isEmpty {
                    Section("Needs your attention") {
                        ForEach(model.ordersNeedingMe) { order in orderRow(order) }
                        ForEach(model.pendingReceived) { offer in
                            offerRow(offer, perspective: .owner)
                        }
                    }
                }
                if !model.ordersInProgress.isEmpty {
                    Section("In progress") {
                        ForEach(model.ordersInProgress) { order in orderRow(order) }
                    }
                }
                if !model.acceptedReceived.isEmpty {
                    Section("Accepted on your listings") {
                        ForEach(model.acceptedReceived) { offer in offerRow(offer, perspective: .owner) }
                    }
                }
                if !model.me.offersMade.isEmpty {
                    Section("My offers") {
                        ForEach(model.me.offersMade) { offer in offerRow(offer, perspective: .offerer) }
                    }
                }
                if !model.ordersDone.isEmpty {
                    Section("Done") {
                        ForEach(model.ordersDone.prefix(20)) { order in orderRow(order) }
                    }
                }
                if !model.me.listings.isEmpty {
                    Section("My listings") {
                        ForEach(model.me.listings) { listing in
                            Button { router.dealsPath.append(.listing(listing.id)) } label: {
                                HStack {
                                    ListingCard(listing: listing, layout: .row)
                                    if let count = listing.offerCount, count > 0 {
                                        Text("\(count)").font(.caption.weight(.bold)).foregroundStyle(.white).padding(6).background(Color.sunny, in: Circle())
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("deals.listing.\(listing.id)")
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("deals.root")
        .refreshable { await model.refresh() }
    }

    @ViewBuilder
    private func orderRow(_ order: Order) -> some View {
        let role = OrderState.role(of: order, myId: model.myId)
        Button { router.dealsPath.append(.order(order.id)) } label: {
            HStack(spacing: Spacing.m) {
                RemoteImage(url: order.listing.thumbURL).frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: Radius.field, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(order.listing.title).font(.lareaHeadline).foregroundStyle(.primary).lineLimit(1)
                    Text("\(role == .payer ? "Buying from" : "Selling to") \(order.counterpart.displayName)").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    HStack(spacing: Spacing.s) {
                        Text(Money.format(cents: order.amountCents, currency: order.currency)).font(.subheadline.weight(.semibold))
                        Pill(text: OrderState.primary(status: order.status, role: role)?.title ?? order.status.label, style: OrderState.primary(status: order.status, role: role) != nil ? .sunny : (order.status == .completed ? .success : .neutral))
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("deals.order.\(order.id)")
    }

    @ViewBuilder
    private func offerRow(_ offer: Offer, perspective: OfferRow.Perspective) -> some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Button { router.dealsPath.append(.listing(offer.listingId)) } label: {
                HStack(spacing: Spacing.s) {
                    RemoteImage(url: offer.listing.thumbURL).frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    Text(offer.listing.title).font(.subheadline.weight(.semibold)).lineLimit(1).foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)
            OfferRow(
                offer: offer,
                perspective: perspective,
                busy: model.busy,
                onAccept: perspective == .owner ? { Task { await model.accept(offer) } } : nil,
                onDecline: perspective == .owner ? { Task { await model.decline(offer) } } : nil,
                onWithdraw: perspective == .offerer && offer.status == .pending ? { Task { await model.withdraw(offer) } } : nil
            )
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
        .listRowBackground(Color.clear)
        .accessibilityIdentifier("deals.offer.\(offer.id)")
    }
}
