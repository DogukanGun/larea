import SwiftUI

struct ListingDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(AppRouter.self) private var router
    let listingId: String
    @State private var model: ListingDetailViewModel?
    @State private var showOffer = false
    @State private var showReport = false
    @State private var confirmBlock = false
    @State private var confirmSold = false
    @State private var confirmCancel = false
    @State private var viewing: ImageAttachment?
    @State private var showPayouts = false
    @State private var showEdit = false

    var body: some View {
        Group {
            if let model { content(model) } else { ProgressView() }
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil {
                model = ListingDetailViewModel(listingId: listingId, api: env.api, location: env.location)
                Task { await model?.load() }
            }
        }
    }

    @ViewBuilder
    private func content(_ model: ListingDetailViewModel) -> some View {
        @Bindable var model = model
        Group {
            if let listing = model.listing {
                detail(listing, model: model)
            } else if model.tooFar {
                ContentUnavailableView("Too far away", systemImage: "location.slash", description: Text("Listings are only visible within 2 km. Come closer to see the details."))
            } else if let error = model.error {
                ContentUnavailableView { Label("Can't load listing", systemImage: "wifi.exclamationmark") } description: { Text(error) } actions: {
                    Button("Retry") { Task { await model.load() } }.buttonStyle(.borderedProminent).tint(.brandPrimary)
                }
            } else {
                ProgressView()
            }
        }
        .alert("Market", isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })) {
            Button("OK") { model.notice = nil }
        } message: { Text(model.notice ?? "") }
        .sheet(isPresented: Binding(get: { model.needsPayouts }, set: { if !$0 { model.needsPayouts = false } })) {
            NavigationStack {
                StripeOnboardingView(onReady: { model.needsPayouts = false })
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Later") { model.needsPayouts = false } } }
            }
        }
        .onChange(of: model.openedOrderId) { _, id in
            guard let id else { return }
            model.openedOrderId = nil
            router.tab = .deals
            router.dealsPath = [.order(id)]
        }
        .refreshable { await model.load() }
    }

    @ViewBuilder
    private func detail(_ listing: Listing, model: ListingDetailViewModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.l) {
                if !listing.images.isEmpty {
                    TabView {
                        ForEach(listing.images) { image in
                            RemoteImage(url: image.thumbURL)
                                .frame(maxWidth: .infinity)
                                .aspectRatio(4 / 3, contentMode: .fill)
                                .clipped()
                                .onTapGesture { viewing = image }
                        }
                    }
                    .tabViewStyle(.page)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    .accessibilityIdentifier("market.listing.images")
                }
                HStack(spacing: Spacing.s) {
                    PriceTag(cents: listing.priceCents, currency: listing.currency, size: .large, style: .plain)
                    Pill(text: listing.kind.label, style: listing.kind == .request ? .sunny : .tint)
                    if listing.status != .active { Pill(text: listing.status.label, style: .neutral) }
                }
                Text(listing.title).font(.lareaTitle2)
                Text([listing.category.label, listing.distanceText, Self.age(listing.createdAt)].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(spacing: Spacing.m) {
                    Avatar(name: listing.owner.displayName, seed: listing.owner.id, size: 36)
                    Text(listing.owner.displayName).font(.lareaHeadline)
                    if listing.mine { Pill(text: "You", style: .tint) }
                }
                if !listing.description.isEmpty {
                    Text(listing.description).font(.body).fixedSize(horizontal: false, vertical: true)
                }
                NoteCard(symbol: "mappin.and.ellipse", text: "The pin shows an approximate spot. Agree on a public meeting place in the offer.")
                if listing.mine, let offers = listing.offers {
                    Text(offers.isEmpty ? "No offers yet" : "Offers (\(offers.count))").font(.lareaTitle3).padding(.top, Spacing.s)
                    ForEach(offers) { offer in
                        OfferRow(offer: offer, perspective: .owner, busy: model.busy, onAccept: { Task { await model.accept(offer) } }, onDecline: { Task { await model.decline(offer) } }, onWithdraw: nil)
                    }
                }
                if !listing.mine, let mine = listing.myOffer {
                    OfferRow(offer: mine, perspective: .offerer, busy: model.busy, onAccept: nil, onDecline: nil, onWithdraw: mine.status == .pending ? { Task { await model.withdraw(mine) } } : nil)
                    if let orderId = mine.orderId {
                        SecondaryButton(title: "Go to deal", identifier: "market.listing.deal") {
                            router.tab = .deals
                            router.dealsPath = [.order(orderId)]
                        }
                    }
                }
            }
            .padding(Spacing.screen)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) { actions(listing, model: model) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if listing.mine {
                        if listing.status == .active {
                            Button("Edit listing", systemImage: "pencil") { showEdit = true }
                        }
                        if listing.status == .active || listing.status == .reserved {
                            Button("Mark as sold", systemImage: "checkmark.seal") { confirmSold = true }
                        }
                        if listing.status == .active {
                            Button("Cancel listing", systemImage: "xmark.circle", role: .destructive) { confirmCancel = true }
                        }
                    } else {
                        Button("Report listing", systemImage: "flag") { showReport = true }
                        Button("Block \(listing.owner.displayName)", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
                    }
                } label: { Image(systemName: "ellipsis.circle") }
                .accessibilityLabel("More")
                .accessibilityIdentifier("market.listing.menu")
            }
        }
        .sheet(isPresented: $showOffer) {
            OfferSheet(listing: listing) { amount, note in Task { await model.makeOffer(amountCents: amount, note: note) } }
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showEdit) {
            CreateListingView(config: model.config, editing: listing) { updated in
                showEdit = false
                model.listing = updated
                if let notice = updated.notice { model.notice = notice }
                Task { await model.load() }
            }
        }
        .sheet(isPresented: $showReport) {
            ReportSheet(onReport: { reason in
                showReport = false
                Task { await model.report(reason: reason) }
            }, reasons: ReportSheet.listingReasons)
            .presentationDetents([.medium, .large])
        }
        .fullScreenCover(item: $viewing) { image in ImageViewer(image: image) }
        .confirmationDialog("Block \(listing.owner.displayName)?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Block", role: .destructive) { Task { await model.blockOwner(); router.marketPath.removeLast() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("You won't see each other's listings, offers or messages.") }
        .confirmationDialog("Mark as sold?", isPresented: $confirmSold, titleVisibility: .visible) {
            Button("Mark as sold") { Task { await model.markSold() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Open offers will be declined.") }
        .confirmationDialog("Cancel this listing?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel listing", role: .destructive) { Task { await model.cancel() } }
            Button("Keep it", role: .cancel) {}
        } message: { Text("It disappears from the map and open offers are declined.") }
    }

    @ViewBuilder
    private func actions(_ listing: Listing, model: ListingDetailViewModel) -> some View {
        VStack(spacing: Spacing.s) {
            if listing.mine {
                if listing.status == .active {
                    Text("Your listing is live. Offers show up above and in Deals.").font(.caption).foregroundStyle(.secondary)
                } else if listing.status == .reserved {
                    Text("Reserved: finish the handover, then mark it as sold.").font(.caption).foregroundStyle(.secondary)
                }
            } else if listing.status == .active {
                if let mine = listing.myOffer, mine.status == .pending {
                    NoteCard(symbol: "clock", text: "Offer sent: \(Money.format(cents: mine.amountCents, currency: listing.currency)). Waiting for \(listing.owner.displayName).")
                } else if let mine = listing.myOffer, mine.status == .accepted {
                    NoteCard(symbol: "checkmark.circle.fill", text: "Accepted! Arrange the handover with \(listing.owner.displayName).")
                } else {
                    PrimaryButton(title: listing.kind == .request ? "Offer to help" : "Make an offer", isLoading: model.busy, identifier: "market.offer") { showOffer = true }
                }
            } else if listing.status == .reserved, listing.myOffer?.status == .accepted {
                NoteCard(symbol: "checkmark.circle.fill", text: "Reserved for you. Arrange the handover with \(listing.owner.displayName).")
            } else {
                Text("This listing is \(listing.status.label.lowercased()).").font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.screen)
        .padding(.vertical, Spacing.m)
        .background(.bar)
    }

    private static func age(_ iso: String) -> String? {
        guard let date = ISO8601DateFormatter.larea.date(from: iso) else { return nil }
        return date.formatted(.relative(presentation: .named))
    }
}

/// An offer line with the actions for the side looking at it.
struct OfferRow: View {
    enum Perspective { case owner, offerer }
    let offer: Offer
    let perspective: Perspective
    let busy: Bool
    let onAccept: (() -> Void)?
    let onDecline: (() -> Void)?
    let onWithdraw: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(spacing: Spacing.m) {
                Avatar(name: offer.offerer.displayName, seed: offer.offerer.id, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(perspective == .owner ? offer.offerer.displayName : "Your offer").font(.lareaHeadline)
                    if let note = offer.note, !note.isEmpty { Text(note).font(.subheadline).foregroundStyle(.secondary) }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(Money.format(cents: offer.amountCents)).font(.lareaTitle3)
                    Pill(text: offer.status.label, style: offer.status == .accepted ? .success : (offer.status == .pending ? .sunny : .neutral))
                }
            }
            if offer.status == .pending {
                HStack(spacing: Spacing.s) {
                    if let onAccept {
                        PrimaryButton(title: "Accept", isLoading: busy, identifier: "market.offer.accept", action: onAccept)
                    }
                    if let onDecline {
                        SecondaryButton(title: "Decline", identifier: "market.offer.decline", action: onDecline)
                    }
                    if let onWithdraw {
                        SecondaryButton(title: "Withdraw offer", identifier: "market.offer.withdraw", action: onWithdraw)
                    }
                }
            }
        }
        .padding(Spacing.m)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .accessibilityIdentifier("market.offer.\(offer.id)")
    }
}
