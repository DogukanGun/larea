import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MarketScheduler } from '../src/market/market.scheduler.js';
import { STRIPE_CLIENT } from '../src/market/stripe/stripe.client.js';
import { FakeStripeClient } from '../src/testing/fake-stripe.client.js';
import { auth, connectWs, createTestApp, makeStripeReady, registerUser, stripeWebhook, type TestContext, type TestUser, verifyAge } from './helpers.js';

interface MarketEvent {
  type: string;
  kind: string;
  orderId?: string;
}

function offsetMeters(point: { lat: number; lng: number }, north: number, east: number): { lat: number; lng: number } {
  return { lat: point.lat + north / 111_320, lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)) };
}

describe('marketplace payments', () => {
  let ctx: TestContext;
  let fake: FakeStripeClient;
  let seller: TestUser;
  let buyer: TestUser;
  let moderator: TestUser;
  let newbie: TestUser;
  const base = { lat: 48.15, lng: 11.58 };
  const near = offsetMeters(base, 300, 200);
  const fix = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng, accuracy: 10 });

  const listing = (title = 'Bike') =>
    ctx.http().post('/market/listings').set(auth(seller)).send({ kind: 'OFFER', category: 'SPORTS', title, priceCents: 8000, ...fix(base) }).expect(201);
  const offerAndAccept = async (amountCents = 7500): Promise<{ orderId: string; listingId: string }> => {
    const l = await listing(`Bike ${randomUUID().slice(0, 4)}`);
    const o = await ctx.http().post(`/market/listings/${l.body.id}/offers`).set(auth(buyer)).send({ amountCents, ...fix(near) }).expect(201);
    const a = await ctx.http().post(`/market/offers/${o.body.id}/accept`).set(auth(seller)).expect(200);
    return { orderId: a.body.order.id, listingId: l.body.id };
  };
  const pay = async (orderId: string) => {
    const checkout = await ctx.http().post(`/market/orders/${orderId}/checkout`).set(auth(buyer)).expect(201);
    const session = fake.sessions.find((s) => s.input.orderId === orderId)!;
    const pi = `pi_${orderId.slice(0, 8)}`;
    await stripeWebhook(ctx, 'checkout.session.completed', { id: session.id, payment_status: 'paid', client_reference_id: orderId, payment_intent: pi, metadata: { orderId } }).expect(200);
    return { checkout: checkout.body, paymentIntentId: pi };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get<FakeStripeClient>(STRIPE_CLIENT);
    seller = await registerUser(ctx, { displayName: `seller_${randomUUID().slice(0, 6)}` });
    buyer = await registerUser(ctx, { displayName: `buyer_${randomUUID().slice(0, 6)}` });
    moderator = await registerUser(ctx, { displayName: `mod_${randomUUID().slice(0, 6)}` });
    newbie = await registerUser(ctx, { displayName: `new_${randomUUID().slice(0, 6)}` });
    for (const u of [seller, buyer, moderator, newbie]) await verifyAge(ctx, u);
    await ctx.prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
    await ctx.redis.client.del(`user:snap:${moderator.id}`);
    await makeStripeReady(ctx, seller);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('onboards a seller with Stripe and learns about readiness from the Connect webhook', async () => {
    const before = await ctx.http().get('/market/stripe/account').set(auth(newbie)).expect(200);
    expect(before.body).toEqual({ connected: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] });
    const link = await ctx.http().post('/market/stripe/account-link').set(auth(newbie)).expect(201);
    expect(link.body.url).toContain('connect.stripe.test');
    const again = await ctx.http().post('/market/stripe/account-link').set(auth(newbie)).expect(201);
    expect(again.body.url).toBe(link.body.url); // one account per user
    const pending = await ctx.http().get('/market/stripe/account').set(auth(newbie)).expect(200);
    expect(pending.body).toMatchObject({ connected: true, payoutsEnabled: false, requirementsDue: ['external_account'] });

    const wsNewbie = await connectWs(ctx, newbie);
    const accountId = await makeStripeReady(ctx, newbie);
    await wsNewbie.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'payouts_ready');
    wsNewbie.close();
    const ready = await ctx.http().get('/market/stripe/account').set(auth(newbie)).expect(200);
    expect(ready.body).toMatchObject({ connected: true, payoutsEnabled: true, detailsSubmitted: true, requirementsDue: [] });

    const eventId = `evt_${randomUUID()}`;
    const replay = await stripeWebhook(ctx, 'account.updated', { id: accountId, payouts_enabled: true }, { id: eventId, connect: true }).expect(200);
    expect(replay.body).toEqual({ received: true });
    const duplicate = await stripeWebhook(ctx, 'account.updated', { id: accountId, payouts_enabled: true }, { id: eventId, connect: true }).expect(200);
    expect(duplicate.body).toEqual({ received: true, duplicate: true });
    const forged = await stripeWebhook(ctx, 'account.updated', { id: accountId }, { signature: 'nope' }).expect(400);
    expect(forged.body.code).toBe('WEBHOOK_SIGNATURE');
    await ctx.http().post('/market/stripe/webhook').set('Content-Type', 'application/json').send({}).expect(400);
  });

  it('opens a deal on accept, sells a checkout page, and marks it paid from the webhook', async () => {
    const { orderId, listingId } = await offerAndAccept();
    const wsBuyer = await connectWs(ctx, buyer);
    const wsSeller = await connectWs(ctx, seller);

    const asPayee = await ctx.http().post(`/market/orders/${orderId}/checkout`).set(auth(seller)).expect(403);
    expect(asPayee.body.code).toBe('FORBIDDEN');
    const first = await ctx.http().post(`/market/orders/${orderId}/checkout`).set(auth(buyer)).expect(201);
    expect(first.body.url).toContain('checkout.stripe.test');
    const second = await ctx.http().post(`/market/orders/${orderId}/checkout`).set(auth(buyer)).expect(201);
    expect(second.body.url).toBe(first.body.url);
    expect(fake.sessions.filter((s) => s.input.orderId === orderId)).toHaveLength(1);
    const session = fake.sessions.find((s) => s.input.orderId === orderId)!;
    expect(session.input).toMatchObject({ amountCents: 7500, currency: 'eur', customerEmail: buyer.email, statementDescriptorSuffix: 'LAREA' });
    expect(session.input.successUrl).toContain(`/market/orders/${orderId}/return?checkout=success`);

    const view = await ctx.http().get(`/market/orders/${orderId}`).set(auth(buyer)).expect(200);
    expect(view.body).toMatchObject({ status: 'AWAITING_PAYMENT', role: 'payer', feeCents: 750, payoutCents: 6750, handoverCode: null, checkout: { url: first.body.url } });

    const pi = `pi_${orderId.slice(0, 8)}`;
    await stripeWebhook(ctx, 'checkout.session.completed', { id: session.id, payment_status: 'paid', client_reference_id: orderId, payment_intent: pi, metadata: { orderId } }).expect(200);
    await wsBuyer.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'order_paid' && e.orderId === orderId);
    await wsSeller.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'order_paid' && e.orderId === orderId);

    const paid = await ctx.http().get(`/market/orders/${orderId}`).set(auth(buyer)).expect(200);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.handoverCode).toMatch(/^\d{6}$/);
    expect(paid.body.approvalDeadlineAt).not.toBeNull();
    expect(paid.body.checkout).toBeNull();
    const sellerView = await ctx.http().get(`/market/orders/${orderId}`).set(auth(seller)).expect(200);
    expect(sellerView.body).toMatchObject({ role: 'payee', handoverCode: null });
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.stripePaymentIntentId).toBe(pi);
    expect(row.stripeChargeId).toBe(pi.replace('pi_', 'ch_'));

    // A second delivery of the same fact changes nothing.
    await stripeWebhook(ctx, 'payment_intent.succeeded', { id: pi, metadata: { orderId }, latest_charge: 'ch_other' }).expect(200);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).stripeChargeId).toBe(pi.replace('pi_', 'ch_'));
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('RESERVED');

    // Handover: wrong codes are counted, the right one releases the payout.
    const wrong = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: '000000' }).expect(400);
    expect(wrong.body.code).toBe('INVALID_CODE');
    await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(buyer)).send({ code: paid.body.handoverCode }).expect(403);
    const done = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: paid.body.handoverCode }).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', role: 'payee', payoutCents: 6750 });
    const transfer = fake.transfers.find((t) => t.orderId === orderId)!;
    expect(transfer).toMatchObject({ amountCents: 6750, currency: 'eur', chargeId: pi.replace('pi_', 'ch_') });
    expect(transfer.destination).toMatch(/^acct_test_/);
    await wsBuyer.waitFor<MarketEvent>((e) => e.type === 'market_update' && e.kind === 'order_completed' && e.orderId === orderId);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('SOLD');
    const again = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: paid.body.handoverCode }).expect(409);
    expect(again.body.code).toBe('INVALID_STATE');

    const me = await ctx.http().get('/market/me').set(auth(seller)).expect(200);
    expect(me.body.payoutsEnabled).toBe(true);
    expect(me.body.orders.find((o: { id: string }) => o.id === orderId)).toMatchObject({ status: 'COMPLETED', role: 'payee' });
    wsBuyer.close();
    wsSeller.close();
  });

  it('locks the handover after too many wrong codes', async () => {
    const { orderId } = await offerAndAccept(1000);
    await pay(orderId);
    for (let i = 0; i < 4; i++) await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: '111111' }).expect(400);
    const locked = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: '111111' }).expect(429);
    expect(locked.body.retryAfterSec).toBe(3600);
    const view = await ctx.http().get(`/market/orders/${orderId}`).set(auth(buyer)).expect(200);
    const stillLocked = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: view.body.handoverCode }).expect(429);
    expect(stillLocked.body.code).toBe('RATE_LIMITED');
  });

  it('refunds a paid deal the buyer backs out of, and cancels unpaid ones', async () => {
    const { orderId, listingId } = await offerAndAccept(2000);
    const { paymentIntentId } = await pay(orderId);
    const refunded = await ctx.http().post(`/market/orders/${orderId}/cancel`).set(auth(buyer)).expect(200);
    expect(refunded.body).toMatchObject({ status: 'REFUNDED', cancelReason: 'payer_cancelled', handoverCode: null });
    expect(fake.refunds.find((r) => r.orderId === orderId)?.paymentIntentId).toBe(paymentIntentId);
    expect((await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe('ACTIVE');
    await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code: '123456' }).expect(409);

    const unpaid = await offerAndAccept(2000);
    await ctx.http().post(`/market/orders/${unpaid.orderId}/checkout`).set(auth(buyer)).expect(201);
    const cancelled = await ctx.http().post(`/market/orders/${unpaid.orderId}/cancel`).set(auth(seller)).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'payee_cancelled' });
    expect(fake.sessions.find((s) => s.input.orderId === unpaid.orderId)?.expired).toBe(true);
    // Money that lands after cancelling goes straight back.
    const session = fake.sessions.find((s) => s.input.orderId === unpaid.orderId)!;
    await stripeWebhook(ctx, 'checkout.session.completed', { id: session.id, payment_status: 'paid', client_reference_id: unpaid.orderId, payment_intent: `pi_late_${randomUUID().slice(0, 8)}`, metadata: { orderId: unpaid.orderId } }).expect(200);
    const late = await ctx.prisma.order.findUniqueOrThrow({ where: { id: unpaid.orderId } });
    expect(late.status).toBe('REFUNDED');
    expect(late.cancelReason).toBe('late_payment');
  });

  it('times out unpaid deals and auto-refunds forgotten ones on the sweep', async () => {
    const stale = await offerAndAccept(1500);
    await ctx.prisma.order.update({ where: { id: stale.orderId }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    const forgotten = await offerAndAccept(1500);
    await pay(forgotten.orderId);
    await ctx.prisma.order.update({ where: { id: forgotten.orderId }, data: { approvalDeadlineAt: new Date(Date.now() - 1000) } });
    const result = await ctx.app.get(MarketScheduler).run();
    expect(result.paymentTimeouts).toBeGreaterThanOrEqual(1);
    expect(result.autoRefunds).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: stale.orderId } })).status).toBe('CANCELLED');
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: forgotten.orderId } })).cancelReason).toBe('auto_refund');
    expect(fake.refunds.filter((r) => r.orderId === forgotten.orderId)).toHaveLength(1);
  });

  it('freezes disputed deals for a moderator and lets them refund or release', async () => {
    const { orderId } = await offerAndAccept(3000);
    const { paymentIntentId } = await pay(orderId);
    await stripeWebhook(ctx, 'charge.dispute.created', { id: 'dp_1', payment_intent: paymentIntentId }).expect(200);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('DISPUTED');
    expect(await ctx.prisma.incident.count({ where: { refId: orderId, status: 'OPEN' } })).toBe(1);
    await ctx.http().post(`/market/orders/${orderId}/cancel`).set(auth(buyer)).expect(409);
    const resolved = await ctx.http().post(`/admin/orders/${orderId}/resolve`).set(auth(moderator)).send({ action: 'refund' }).expect(201);
    expect(resolved.body.status).toBe('REFUNDED');
    expect(await ctx.prisma.incident.count({ where: { refId: orderId, status: 'OPEN' } })).toBe(0);
    await ctx.http().post(`/admin/orders/${orderId}/resolve`).set(auth(buyer)).send({ action: 'refund' }).expect(403);
  });

  it('caps daily volume and bounces the buyer back into the app after checkout', async () => {
    const l = await listing('Pricey bike');
    const o = await ctx.http().post(`/market/listings/${l.body.id}/offers`).set(auth(buyer)).send({ amountCents: 50_000, ...fix(near) }).expect(201);
    // buyer already has many deals today; env cap is 100 000 cents.
    await ctx.prisma.order.updateMany({ where: { payerId: buyer.id }, data: { amountCents: 40_000 } });
    const capped = await ctx.http().post(`/market/offers/${o.body.id}/accept`).set(auth(seller)).expect(409);
    expect(capped.body.code).toBe('DAILY_LIMIT');

    const id = randomUUID();
    const success = await ctx.http().get(`/market/orders/${id}/return`).query({ checkout: 'success' }).expect(302);
    expect(success.headers.location).toBe(`larea://market/order/${id}?checkout=success`);
    await ctx.http().get(`/market/orders/${id}/return`).query({ checkout: 'sideways' }).expect(400);
    await ctx.http().get('/market/orders/not-a-uuid/return').query({ checkout: 'success' }).expect(400);
    const back = await ctx.http().get('/market/stripe/return').expect(302);
    expect(back.headers.location).toBe('larea://market/stripe/return?status=complete');
  });
});
