import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MarketScheduler } from '../src/market/market.scheduler.js';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { auth, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

const SOLANA = { 'X-Larea-Build': 'solana' };

describe('marketplace in USDC (Solana build)', () => {
  let ctx: TestContext;
  let fake: FakeSolanaClient;
  let seller: TestUser & { address: string };
  let buyer: TestUser & { address: string };
  let playBuyer: TestUser;
  let moderator: TestUser;
  // Somewhere of our own, so other suites' listings stay out of the way.
  const base = { lat: -40 - Math.random() * 5, lng: 170 + Math.random() * 5 };
  const fix = { ...base, accuracy: 10 };

  async function withWallet(user: TestUser): Promise<TestUser & { address: string }> {
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(user)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    const signature = Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64');
    await ctx.http().post('/solana/wallet').set(auth(user)).send({ address, message: Buffer.from(message).toString('base64'), signature }).expect(201);
    return { ...user, address };
  }

  async function user(): Promise<TestUser> {
    const u = await registerUser(ctx);
    await verifyAge(ctx, u);
    return u;
  }

  /** A USDC listing by the seller, an offer by the buyer and the accepted deal. */
  async function deal(amountCents = 7500): Promise<{ orderId: string; listingId: string }> {
    const listing = await ctx.http().post('/market/listings').set(auth(seller)).set(SOLANA).send({ kind: 'OFFER', category: 'SPORTS', title: `Board ${randomUUID().slice(0, 4)}`, priceCents: 8000, ...fix }).expect(201);
    const offer = await ctx.http().post(`/market/listings/${listing.body.id}/offers`).set(auth(buyer)).set(SOLANA).send({ amountCents, ...fix }).expect(201);
    const accepted = await ctx.http().post(`/market/offers/${offer.body.id}/accept`).set(auth(seller)).expect(200);
    return { orderId: accepted.body.order.id, listingId: listing.body.id };
  }

  async function pay(orderId: string) {
    const prepared = await ctx.http().post(`/market/orders/${orderId}/solana/pay`).set(auth(buyer)).set(SOLANA).expect(201);
    return ctx.http().post(`/market/orders/${orderId}/solana/submit`).set(auth(buyer)).set(SOLANA).send({ signedTransaction: fake.sign(prepared.body.transaction) }).expect(200);
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get(SOLANA_CLIENT);
    seller = await withWallet(await user());
    buyer = await withWallet(await user());
    playBuyer = await user();
    moderator = await user();
    await ctx.prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
    await ctx.redis.client.del(`user:snap:${moderator.id}`);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('prices Solana-build listings in USDC and keeps other builds out of them', async () => {
    const listing = await ctx.http().post('/market/listings').set(auth(seller)).set(SOLANA).send({ kind: 'OFFER', category: 'BOOKS', title: 'Atlas', priceCents: 1500, ...fix }).expect(201);
    expect(listing.body).toMatchObject({ paymentRail: 'SOLANA_USDC', currency: 'usdc' });
    const card = await ctx.http().post('/market/listings').set(auth(seller)).send({ kind: 'OFFER', category: 'BOOKS', title: 'Map', priceCents: 1500, ...fix }).expect(201);
    expect(card.body.paymentRail).toBe('STRIPE');

    const refused = await ctx.http().post(`/market/listings/${listing.body.id}/offers`).set(auth(playBuyer)).send({ amountCents: 1500, ...fix }).expect(409);
    expect(refused.body.code).toBe('SOLANA_APP_REQUIRED');
    const noWallet = await ctx.http().post(`/market/listings/${listing.body.id}/offers`).set(auth(playBuyer)).set(SOLANA).send({ amountCents: 1500, ...fix }).expect(409);
    expect(noWallet.body.code).toBe('WALLET_REQUIRED');
  });

  it('pays into escrow, pays the seller out on the handover and never uses Stripe', async () => {
    const { orderId, listingId } = await deal(7500);
    const order = await ctx.http().get(`/market/orders/${orderId}`).set(auth(buyer)).expect(200);
    expect(order.body).toMatchObject({ paymentRail: 'SOLANA_USDC', currency: 'usdc', status: 'AWAITING_PAYMENT', feeCents: 750 });
    const card = await ctx.http().post(`/market/orders/${orderId}/checkout`).set(auth(buyer)).expect(409);
    expect(card.body.code).toBe('USE_WALLET');

    const paid = await pay(orderId);
    expect(paid.body).toMatchObject({ status: 'PAID', solana: { paySignature: expect.any(String) } });
    expect(fake.transfers.at(-1)).toMatchObject({ from: buyer.address, to: fake.custodyAddress('escrow'), token: 'USDC', amount: '75000000', memo: `larea:order:${orderId}` });
    const code = paid.body.handoverCode as string;

    const done = await ctx.http().post(`/market/orders/${orderId}/approve`).set(auth(seller)).send({ code }).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', solana: { payoutSignature: expect.any(String) } });
    expect(fake.custodySent.at(-1)).toMatchObject({ wallet: 'escrow', to: seller.address, token: 'USDC', amount: '67500000', memo: `larea:payout:${orderId}` });
    const listing = await ctx.prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('SOLD');
  });

  it('refunds from escrow when the buyer backs out, and when a moderator decides', async () => {
    const first = await deal();
    await pay(first.orderId);
    const cancelled = await ctx.http().post(`/market/orders/${first.orderId}/cancel`).set(auth(buyer)).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'REFUNDED', solana: { refundSignature: expect.any(String) } });
    expect(fake.custodySent.at(-1)).toMatchObject({ to: buyer.address, amount: '75000000', memo: `larea:refund:${first.orderId}` });

    const second = await deal();
    await pay(second.orderId);
    const resolved = await ctx.http().post(`/admin/orders/${second.orderId}/resolve`).set(auth(moderator)).send({ action: 'refund' }).expect(201);
    expect(resolved.body.status).toBe('REFUNDED');
    expect(fake.custodySent.at(-1)).toMatchObject({ to: buyer.address, memo: `larea:refund:${second.orderId}` });
  });

  it('settles a payment the app never reported back and refunds one that lands after a cancel', async () => {
    const { orderId } = await deal();
    const prepared = await ctx.http().post(`/market/orders/${orderId}/solana/pay`).set(auth(buyer)).set(SOLANA).expect(201);
    fake.landNext = 'pending';
    const signature = fake.sendFromWallet(prepared.body.transaction);
    fake.landNext = 'confirmed';
    const reported = await ctx.http().post(`/market/orders/${orderId}/solana/submit`).set(auth(buyer)).set(SOLANA).send({ signature }).expect(200);
    expect(reported.body.status).toBe('AWAITING_PAYMENT');
    const busy = await ctx.http().post(`/market/orders/${orderId}/cancel`).set(auth(buyer)).expect(409);
    expect(busy.body.code).toBe('PAYMENT_PENDING');

    fake.land(signature);
    await ctx.app.get(MarketScheduler).run();
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PAID');

    // A payment that lands on a deal that timed out meanwhile goes back to the buyer.
    const late = await deal();
    const latePrepared = await ctx.http().post(`/market/orders/${late.orderId}/solana/pay`).set(auth(buyer)).set(SOLANA).expect(201);
    fake.landNext = 'pending';
    const lateSig = fake.sendFromWallet(latePrepared.body.transaction);
    fake.landNext = 'confirmed';
    await ctx.http().post(`/market/orders/${late.orderId}/solana/submit`).set(auth(buyer)).set(SOLANA).send({ signature: lateSig }).expect(200);
    await ctx.prisma.order.update({ where: { id: late.orderId }, data: { status: 'CANCELLED', cancelReason: 'payment_timeout', cancelledAt: new Date() } });
    fake.land(lateSig);
    await ctx.app.get(MarketScheduler).run();
    const refunded = await ctx.prisma.order.findUniqueOrThrow({ where: { id: late.orderId } });
    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundSignature).toBeTruthy();
  });
});
