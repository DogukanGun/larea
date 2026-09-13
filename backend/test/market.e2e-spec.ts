import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MarketScheduler } from '../src/market/market.scheduler.js';
import { RetentionService } from '../src/retention/retention.service.js';
import { haversineMeters } from '../src/venues/geo.js';
import { auth, connectWs, createTestApp, makeStripeReady, registerUser, type TestContext, type TestUser, uploadImage, verifyAge } from './helpers.js';

interface MarketEvent {
  type: string;
  kind: string;
  listingId: string;
  offerId?: string;
}

/** Moves a point by metres north/east. */
function offsetMeters(point: { lat: number; lng: number }, north: number, east: number): { lat: number; lng: number } {
  return { lat: point.lat + north / 111_320, lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)) };
}

describe('marketplace listings and offers', () => {
  let ctx: TestContext;
  let seller: TestUser;
  let buyer: TestUser;
  let farUser: TestUser;
  let blocked: TestUser;
  let moderator: TestUser;
  const base = { lat: 48.1401, lng: 11.5702 };
  const near = offsetMeters(base, 400, 300);
  const far = offsetMeters(base, 5000, 0);
  const fix = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng, accuracy: 12 });

  const create = (u: TestUser, body: Record<string, unknown>) =>
    ctx.http().post('/market/listings').set(auth(u)).send({ kind: 'OFFER', category: 'FURNITURE', title: 'IKEA desk, good condition', description: 'White, 120 cm, small scratch', priceCents: 2500, ...fix(base), ...body });
  const feed = (u: TestUser, query: Record<string, unknown> = {}) => ctx.http().get('/market/listings').set(auth(u)).query({ ...fix(near), ...query });
  const offer = (u: TestUser, listingId: string, body: Record<string, unknown> = {}) =>
    ctx.http().post(`/market/listings/${listingId}/offers`).set(auth(u)).send({ amountCents: 2000, ...fix(near), ...body });
  /** Rejected content earns strikes and eventually a mute; lift it so later scenarios run. */
  const unmute = async (u: TestUser) => {
    await ctx.prisma.user.update({ where: { id: u.id }, data: { mutedUntil: null } });
    await ctx.redis.client.del(`user:snap:${u.id}`);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    seller = await registerUser(ctx, { displayName: `seller_${randomUUID().slice(0, 6)}` });
    buyer = await registerUser(ctx, { displayName: `buyer_${randomUUID().slice(0, 6)}` });
    farUser = await registerUser(ctx, { displayName: `far_${randomUUID().slice(0, 6)}` });
    blocked = await registerUser(ctx, { displayName: `blocked_${randomUUID().slice(0, 6)}` });
    moderator = await registerUser(ctx, { displayName: `mod_${randomUUID().slice(0, 6)}` });
    for (const u of [seller, buyer, farUser, blocked, moderator]) await verifyAge(ctx, u);
    await ctx.prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
    await ctx.redis.client.del(`user:snap:${moderator.id}`);
    await ctx.http().post(`/users/${blocked.id}/block`).set(auth(seller)).expect(204);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  let listingId: string;
  let imageIds: string[];

  it('creates a listing with photos at an approximate public position', async () => {
    imageIds = [(await uploadImage(ctx, seller)).id, (await uploadImage(ctx, seller)).id];
    const res = await create(seller, { mediaIds: imageIds }).expect(201);
    listingId = res.body.id;
    expect(res.body).toMatchObject({ kind: 'OFFER', category: 'FURNITURE', title: 'IKEA desk, good condition', priceCents: 2500, currency: 'eur', status: 'ACTIVE', mine: true, offerCount: 0, myOffer: null, offers: [] });
    expect(res.body.images).toHaveLength(2);
    expect(res.body.location.approximate).toBe(true);
    const shift = haversineMeters(base, res.body.location);
    expect(shift).toBeGreaterThan(0);
    expect(shift).toBeLessThan(120);
    const row = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(row.lat).toBeCloseTo(base.lat, 6); // exact spot stays in the database only
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    for (const id of imageIds) expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id } })).status).toBe('ATTACHED');
  });

  it('rejects bad input, imprecise or simulated fixes, and content the classifier refuses', async () => {
    await create(seller, { priceCents: 50 }).expect(400);
    await create(seller, { priceCents: 60_000 }).expect(400);
    await create(seller, { title: 'ab' }).expect(400);
    await create(seller, { mediaIds: Array.from({ length: 6 }, () => randomUUID().replace(/-/g, '')) }).expect(400);
    const imprecise = await create(seller, { accuracy: 150 }).expect(422);
    expect(imprecise.body.code).toBe('LOCATION_IMPRECISE');
    const mocked = await create(seller, { mocked: true }).expect(422);
    expect(mocked.body.code).toBe('MOCK_LOCATION');

    const badPhoto = (await uploadImage(ctx, seller)).id;
    const rejected = await create(seller, { description: 'nice [image-block]', mediaIds: [badPhoto] }).expect(422);
    expect(rejected.body.code).toBe('CONTENT_REJECTED');
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: badPhoto } })).status).toBe('REJECTED');
    const scam = await create(seller, { title: 'crypto giveaway desk' }).expect(422);
    expect(scam.body.code).toBe('CONTENT_REJECTED');
    // Two rejected listings in a row are strikes: the seller is muted for an hour.
    const muted = await create(seller, {}).expect(403);
    expect(muted.body.code).toBe('MUTED');
    await unmute(seller);
    const down = await create(seller, { title: 'desk [unavailable]' }).expect(503);
    expect(down.body.code).toBe('MODERATION_UNAVAILABLE');
    const foreignPhoto = (await uploadImage(ctx, buyer)).id;
    await create(seller, { mediaIds: [foreignPhoto] }).expect(404);
  });

  it('shows the listing to neighbours within reach, with filters, and hides it from blocked people', async () => {
    const seen = await feed(buyer).expect(200);
    const mine = seen.body.listings.find((l: { id: string }) => l.id === listingId);
    expect(mine).toMatchObject({ mine: false, title: 'IKEA desk, good condition' });
    expect(mine.distanceM % 50).toBe(0);
    expect(mine.distanceM).toBeGreaterThan(300);
    expect(mine.offerCount).toBeUndefined();
    expect(seen.body.radiusM).toBe(2000);

    const capped = await feed(buyer, { radiusM: 3000 }).expect(200);
    expect(capped.body.radiusM).toBe(2000);
    const away = await ctx.http().get('/market/listings').set(auth(farUser)).query(fix(far)).expect(200);
    expect(away.body.listings.map((l: { id: string }) => l.id)).not.toContain(listingId);

    expect((await feed(buyer, { kind: 'REQUEST' }).expect(200)).body.listings.map((l: { id: string }) => l.id)).not.toContain(listingId);
    expect((await feed(buyer, { category: 'FURNITURE', minPriceCents: 2000, maxPriceCents: 3000, q: 'ikea', sort: 'price' }).expect(200)).body.listings.map((l: { id: string }) => l.id)).toContain(listingId);
    expect((await feed(buyer, { q: 'bicycle' }).expect(200)).body.listings.map((l: { id: string }) => l.id)).not.toContain(listingId);
    const hidden = await feed(blocked).expect(200);
    expect(hidden.body.listings.map((l: { id: string }) => l.id)).not.toContain(listingId);
    const paged = await feed(buyer, { limit: 1 }).expect(200);
    expect(paged.body.listings).toHaveLength(1);
  });

  it('gates the detail page on distance unless you are involved', async () => {
    const detail = await ctx.http().get(`/market/listings/${listingId}`).set(auth(buyer)).query(fix(near)).expect(200);
    expect(detail.body).toMatchObject({ mine: false, myOffer: null, owner: { displayName: seller.displayName } });
    expect(detail.body.offers).toBeUndefined();
    const tooFar = await ctx.http().get(`/market/listings/${listingId}`).set(auth(farUser)).query(fix(far)).expect(403);
    expect(tooFar.body.code).toBe('TOO_FAR');
    await ctx.http().get(`/market/listings/${listingId}`).set(auth(buyer)).expect(403);
    await ctx.http().get(`/market/listings/${listingId}`).set(auth(buyer)).query({ lat: near.lat }).expect(400);
    const owner = await ctx.http().get(`/market/listings/${listingId}`).set(auth(seller)).expect(200);
    expect(owner.body.offers).toEqual([]);
    await ctx.http().get(`/market/listings/${listingId}`).set(auth(blocked)).query(fix(near)).expect(404);
  });

  it('runs the offer lifecycle: offer, decline, offer again, accept, reserve, sell', async () => {
    const wsSeller = await connectWs(ctx, seller);
    const wsBuyer = await connectWs(ctx, buyer);

    const first = await offer(buyer, listingId, { note: 'Could pick it up tonight' }).expect(201);
    expect(first.body).toMatchObject({ status: 'PENDING', amountCents: 2000, note: 'Could pick it up tonight', listing: { id: listingId, title: 'IKEA desk, good condition' }, offerer: { id: buyer.id } });
    const received = await wsSeller.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'offer_received');
    expect(received).toMatchObject({ listingId, offerId: first.body.id });

    const dup = await offer(buyer, listingId).expect(409);
    expect(dup.body.code).toBe('OFFER_EXISTS');
    const own = await offer(seller, listingId, fix(base)).expect(400); // from where the seller actually stands
    expect(own.body.code).toBe('OWN_LISTING');
    const away = await ctx.http().post(`/market/listings/${listingId}/offers`).set(auth(farUser)).send({ amountCents: 2000, ...fix(far) }).expect(403);
    expect(away.body.code).toBe('TOO_FAR');
    await ctx.http().post(`/market/listings/${listingId}/offers`).set(auth(blocked)).send({ amountCents: 2000, ...fix(near) }).expect(404);
    const badNote = await ctx.http().post(`/market/listings/${listingId}/offers`).set(auth(moderator)).send({ amountCents: 2000, note: 'pay me in crypto giveaway', ...fix(near) }).expect(422);
    expect(badNote.body.code).toBe('CONTENT_REJECTED');
    await unmute(moderator);

    await ctx.http().post(`/market/offers/${first.body.id}/decline`).set(auth(buyer)).expect(404);
    await ctx.http().post(`/market/offers/${first.body.id}/withdraw`).set(auth(seller)).expect(404);
    const declined = await ctx.http().post(`/market/offers/${first.body.id}/decline`).set(auth(seller)).expect(200);
    expect(declined.body.status).toBe('DECLINED');
    await wsBuyer.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'offer_declined' && e.offerId === first.body.id);

    const second = await offer(buyer, listingId, { amountCents: 2200 }).expect(201);
    const withdrawn = await ctx.http().post(`/market/offers/${second.body.id}/withdraw`).set(auth(buyer)).expect(200);
    expect(withdrawn.body.status).toBe('WITHDRAWN');
    await wsSeller.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'offer_withdrawn');

    const third = await offer(buyer, listingId, { amountCents: 2300 }).expect(201);
    const mine = await ctx.http().get('/market/me').set(auth(seller)).expect(200);
    expect(mine.body.listings.find((l: { id: string }) => l.id === listingId).offerCount).toBe(1);
    expect(mine.body.offersReceived.map((o: { id: string }) => o.id)).toContain(third.body.id);
    const buyerMe = await ctx.http().get('/market/me').set(auth(buyer)).expect(200);
    expect(buyerMe.body.offersMade.map((o: { id: string }) => o.id)).toContain(third.body.id);

    // Payments are on in tests: the seller needs a payout account before taking money.
    const notReady = await ctx.http().post(`/market/offers/${third.body.id}/accept`).set(auth(seller)).expect(403);
    expect(notReady.body).toMatchObject({ code: 'PAYOUTS_NOT_READY', action: 'stripe_onboarding' });
    await makeStripeReady(ctx, seller);
    const accepted = await ctx.http().post(`/market/offers/${third.body.id}/accept`).set(auth(seller)).expect(200);
    expect(accepted.body.offer.status).toBe('ACCEPTED');
    expect(accepted.body.order).toMatchObject({ status: 'AWAITING_PAYMENT', amountCents: 2300, role: 'payee', payer: { id: buyer.id }, payee: { id: seller.id } });
    expect(accepted.body.offer.orderId).toBe(accepted.body.order.id);
    await wsBuyer.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'offer_accepted' && e.offerId === third.body.id);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('RESERVED');
    const late = await ctx.http().post(`/market/listings/${listingId}/offers`).set(auth(moderator)).send({ amountCents: 2000, ...fix(near) }).expect(409);
    expect(late.body.code).toBe('INVALID_STATE');
    const cancelReserved = await ctx.http().post(`/market/listings/${listingId}/cancel`).set(auth(seller)).expect(409);
    expect(cancelReserved.body.code).toBe('LISTING_RESERVED');
    expect((await feed(buyer).expect(200)).body.listings.map((l: { id: string }) => l.id)).not.toContain(listingId); // reserved listings leave the feed
    const detail = await ctx.http().get(`/market/listings/${listingId}`).set(auth(buyer)).expect(200); // still visible to the buyer, no fix needed
    expect(detail.body.myOffer.status).toBe('ACCEPTED');

    // Backing out of the unpaid deal frees the listing; marking it sold by hand still works.
    const cancelledDeal = await ctx.http().post(`/market/orders/${accepted.body.order.id}/cancel`).set(auth(buyer)).expect(200);
    expect(cancelledDeal.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'payer_cancelled' });
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('ACTIVE');
    const sold = await ctx.http().post(`/market/listings/${listingId}/sold`).set(auth(seller)).expect(200);
    expect(sold.body.status).toBe('SOLD');
    wsSeller.close();
    wsBuyer.close();
  });

  it('edits and cancels listings, declining pending offers', async () => {
    const res = await create(seller, { title: 'Bike helmet', category: 'SPORTS', priceCents: 1500 }).expect(201);
    const id = res.body.id;
    const edited = await ctx.http().patch(`/market/listings/${id}`).set(auth(seller)).send({ title: 'Bike helmet, size M', priceCents: 1400 }).expect(200);
    expect(edited.body).toMatchObject({ title: 'Bike helmet, size M', priceCents: 1400 });
    const rejected = await ctx.http().patch(`/market/listings/${id}`).set(auth(seller)).send({ title: 'crypto giveaway helmet' }).expect(422);
    expect(rejected.body.code).toBe('CONTENT_REJECTED');
    await unmute(seller);
    await ctx.http().patch(`/market/listings/${id}`).set(auth(buyer)).send({ title: 'Not mine' }).expect(404);

    const pending = await offer(buyer, id, { amountCents: 1000 }).expect(201);
    const cancelled = await ctx.http().post(`/market/listings/${id}/cancel`).set(auth(seller)).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await ctx.prisma.offer.findUniqueOrThrow({ where: { id: pending.body.id } })).status).toBe('DECLINED');
    expect((await feed(buyer).expect(200)).body.listings.map((l: { id: string }) => l.id)).not.toContain(id);
    await ctx.http().get(`/market/listings/${id}`).set(auth(farUser)).query(fix(near)).expect(404);
  });

  it('takes a listing down after three reports and lets a moderator act on listing reports', async () => {
    const photo = (await uploadImage(ctx, seller)).id;
    const res = await create(seller, { title: 'Reported lamp', mediaIds: [photo] }).expect(201);
    const id = res.body.id;
    const selfReport = await ctx.http().post(`/market/listings/${id}/reports`).set(auth(seller)).send({ reason: 'SPAM' }).expect(400);
    expect(selfReport.body.code).toBe('CANNOT_REPORT_SELF');
    await ctx.http().post(`/market/listings/${id}/reports`).set(auth(buyer)).send({ reason: 'PROHIBITED_ITEM', details: 'looks stolen' }).expect(200);
    await ctx.http().post(`/market/listings/${id}/reports`).set(auth(buyer)).send({ reason: 'PROHIBITED_ITEM' }).expect(200); // idempotent per reporter
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
    await ctx.http().post(`/market/listings/${id}/reports`).set(auth(farUser)).send({ reason: 'SCAM' }).expect(200);
    await ctx.http().post(`/market/listings/${id}/reports`).set(auth(blocked)).send({ reason: 'OFF_PLATFORM_PAYMENT' }).expect(200);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: photo } })).status).toBe('QUARANTINED');
    const incident = await ctx.prisma.incident.findFirst({ where: { refId: id } });
    expect(incident?.kind).toBe('REPORT_THRESHOLD');

    const queue = await ctx.http().get('/admin/reports').set(auth(moderator)).expect(200);
    const entry = queue.body.find((r: { listing?: { id: string } }) => r.listing?.id === id);
    expect(entry.listing.title).toBe('Reported lamp');
    expect(entry.message).toBeNull();
    const resolved = await ctx.http().post(`/admin/reports/${entry.id}/resolve`).set(auth(moderator)).send({ action: 'HIDE_CONTENT' }).expect(201);
    expect(resolved.body.status).toBe('ACTIONED');
    expect(await ctx.prisma.report.count({ where: { listingId: id, status: 'OPEN' } })).toBe(0);
    expect((await ctx.prisma.incident.findFirstOrThrow({ where: { refId: id } })).status).toBe('RESOLVED');

    // A moderator can also mute over a listing report on a live listing.
    const other = await create(seller, { title: 'Second lamp' }).expect(201);
    await ctx.http().post(`/market/listings/${other.body.id}/reports`).set(auth(buyer)).send({ reason: 'HARASSMENT' }).expect(200);
    const report = await ctx.prisma.report.findFirstOrThrow({ where: { listingId: other.body.id } });
    await ctx.http().post(`/admin/reports/${report.id}/resolve`).set(auth(moderator)).send({ action: 'MUTE', durationHours: 1 }).expect(201);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: other.body.id } })).status).toBe('REMOVED');
    const violation = await ctx.prisma.violation.findFirst({ where: { listingId: other.body.id } });
    expect(violation?.source).toBe('MODERATOR');
    await unmute(seller);
  });

  it('handles help requests with the same offer flow', async () => {
    const requester = await registerUser(ctx, { displayName: `req_${randomUUID().slice(0, 6)}` });
    const helper = await registerUser(ctx, { displayName: `help_${randomUUID().slice(0, 6)}` });
    await verifyAge(ctx, requester);
    await verifyAge(ctx, helper);
    const res = await create(requester, { kind: 'REQUEST', category: 'HELP', title: 'Help me carry a sofa upstairs', priceCents: 3000 }).expect(201);
    expect(res.body.kind).toBe('REQUEST');
    const seen = await feed(helper, { kind: 'REQUEST' }).expect(200);
    expect(seen.body.listings.map((l: { id: string }) => l.id)).toContain(res.body.id);
    const noPayouts = await offer(helper, res.body.id, { amountCents: 2500, note: 'Free on Saturday' }).expect(403);
    expect(noPayouts.body.code).toBe('PAYOUTS_NOT_READY'); // the helper is the one getting paid
    await makeStripeReady(ctx, helper);
    const help = await offer(helper, res.body.id, { amountCents: 2500, note: 'Free on Saturday' }).expect(201);
    const accepted = await ctx.http().post(`/market/offers/${help.body.id}/accept`).set(auth(requester)).expect(200);
    expect(accepted.body.offer.status).toBe('ACCEPTED');
    expect(accepted.body.order).toMatchObject({ payer: { id: requester.id }, payee: { id: helper.id }, role: 'payer' });
  });

  it('expires stale offers and listings on the sweep, and purges closed listings with their photos', async () => {
    const photo = (await uploadImage(ctx, seller)).id;
    const res = await create(seller, { title: 'Old chair', mediaIds: [photo] }).expect(201);
    const pending = await offer(buyer, res.body.id, { amountCents: 500 }).expect(201);
    await ctx.prisma.offer.update({ where: { id: pending.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const sweep = await ctx.app.get(MarketScheduler).run();
    expect(sweep.offersExpired).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.offer.findUniqueOrThrow({ where: { id: pending.body.id } })).status).toBe('EXPIRED');

    await ctx.prisma.listing.update({ where: { id: res.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const again = await ctx.app.get(MarketScheduler).run();
    expect(again.listingsExpired).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: res.body.id } })).status).toBe('EXPIRED');

    await ctx.prisma.listing.update({ where: { id: res.body.id }, data: { updatedAt: new Date(Date.now() - 40 * 86_400_000) } });
    const retention = await ctx.app.get(RetentionService).run();
    expect(retention.listings).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.listing.findUnique({ where: { id: res.body.id } })).toBeNull();
    expect(await ctx.prisma.media.findUnique({ where: { id: photo } })).toBeNull();
  });
});
