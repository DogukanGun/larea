import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PinsService } from '../src/pins/pins.service.js';
import { PIN_TIERS } from '../src/pins/pricing.js';
import { STORE_VERIFIER } from '../src/pins/store-verifier.js';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { FakeStoreVerifier } from '../src/testing/fake-store-verifier.js';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

/** Moves a point by metres north/east. */
function offsetMeters(point: { lat: number; lng: number }, north: number, east: number): { lat: number; lng: number } {
  return { lat: point.lat + north / 111_320, lng: point.lng + east / (111_320 * Math.cos((point.lat * Math.PI) / 180)) };
}

interface PinEvent {
  type: string;
  pinId?: string;
  reason?: string;
  messageId?: string;
  text?: string;
  message?: { id: string; text: string; pinId: string };
}

/**
 * FakeGeocoder: a city is a 1° cell and a country a 10° cell. The base sits in the middle of its
 * city so a few kilometres stay inside it; a random longitude keeps runs apart.
 */
describe('message pins', () => {
  let ctx: TestContext;
  let store: FakeStoreVerifier;
  let solana: FakeSolanaClient;
  let pins: PinsService;
  let owner: TestUser;
  let reader: TestUser;
  let farUser: TestUser;
  const base = { lat: -61.5, lng: -140.5 + Math.random() * 0.2 };
  const fix = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng, accuracy: 10 });

  const quote = (u: TestUser, target: { lat: number; lng: number }, text = 'Sunset meetup at the pier, 7pm!', from = base) =>
    ctx.http().post('/pins/quote').set(auth(u)).send({ ...target, text, fix: fix(from) });
  const buyApple = (u: TestUser, pin: { id: string }, productId: string, transactionId = randomUUID(), token = pin.id) =>
    ctx
      .http()
      .post(`/pins/${pin.id}/purchase`)
      .set(auth(u))
      .send({ platform: 'apple', signedTransaction: FakeStoreVerifier.appleJws({ transactionId, productId, appAccountToken: token.toUpperCase() }) });
  /** Quotes and pays a nearby pin; returns its id. */
  const livePin = async (u: TestUser, target = offsetMeters(base, 100, 0), text?: string): Promise<string> => {
    const q = await quote(u, target, text).expect(201);
    await buyApple(u, q.body.pin, q.body.productId).expect(200);
    return q.body.pin.id as string;
  };
  const created: string[] = [];
  const user = async (name: string): Promise<TestUser> => {
    const u = await registerUser(ctx, { displayName: `${name}_${randomUUID().slice(0, 6)}` });
    created.push(u.id);
    await verifyAge(ctx, u);
    return u;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    store = ctx.app.get(STORE_VERIFIER);
    solana = ctx.app.get(SOLANA_CLIENT);
    pins = ctx.app.get(PinsService);
    owner = await user('owner');
    reader = await user('reader');
    farUser = await user('far');
  });

  afterAll(async () => {
    // Open reports and incidents would crowd the moderators' queues that other suites read.
    await ctx?.prisma.report.deleteMany({ where: { OR: [{ pin: { ownerId: owner?.id } }, { pinMessage: { pin: { ownerId: owner?.id } } }] } });
    await ctx?.prisma.incident.deleteMany({ where: { userId: { in: created } } });
    await ctx?.close();
  });

  it('prices by where the buyer is: nearby, same city, same country, abroad', async () => {
    const nearby = await quote(owner, offsetMeters(base, 990, 0)).expect(201);
    expect(nearby.body).toMatchObject({ tier: 'NEARBY', productId: PIN_TIERS.NEARBY.productId, priceUsd: '3.99', durationHours: 24 });
    expect(nearby.body.pin).toMatchObject({ status: 'PENDING_PAYMENT', mine: true, text: 'Sunset meetup at the pier, 7pm!' });

    const city = await quote(owner, offsetMeters(base, 1100, 0)).expect(201);
    expect(city.body).toMatchObject({ tier: 'CITY', priceUsd: '10.99', durationHours: 72 });
    expect(city.body.buyerCity).toBe(city.body.targetCity);

    const country = await quote(owner, { lat: base.lat + 1, lng: base.lng }).expect(201);
    expect(country.body).toMatchObject({ tier: 'COUNTRY', priceUsd: '29.99', durationHours: 72 });

    const world = await quote(owner, { lat: base.lat + 12, lng: base.lng }).expect(201);
    expect(world.body).toMatchObject({ tier: 'WORLD', productId: PIN_TIERS.WORLD.productId, priceUsd: '39.99', durationHours: 168 });

    // Unpaid quotes are not on the map.
    const map = await ctx.http().get('/pins/nearby').set(auth(reader)).query({ ...fix(base), viewLat: base.lat, viewLng: base.lng, viewRadiusM: 3000 }).expect(200);
    expect(map.body.pins.map((p: { id: string }) => p.id)).not.toContain(nearby.body.pin.id);
  });

  it('refuses text the classifier blocks before anyone pays, and simulated fixes', async () => {
    const author = await user('rude');
    const before = await ctx.prisma.pin.count({ where: { ownerId: author.id } });
    const res = await quote(author, offsetMeters(base, 100, 0), 'crypto giveaway, send me money').expect(422);
    expect(res.body.code).toBe('PIN_TEXT_REJECTED');
    expect(await ctx.prisma.pin.count({ where: { ownerId: author.id } })).toBe(before);

    const mocked = await ctx.http().post('/pins/quote').set(auth(author)).send({ ...base, text: 'hi', fix: { ...fix(base), mocked: true } }).expect(422);
    expect(mocked.body.code).toBe('MOCK_LOCATION');
  });

  it('activates a pin with an App Store purchase, once per transaction', async () => {
    const q = await quote(owner, offsetMeters(base, 200, 0)).expect(201);
    const pin = q.body.pin;

    const wrongTier = await buyApple(owner, pin, PIN_TIERS.CITY.productId).expect(400);
    expect(wrongTier.body.code).toBe('PURCHASE_MISMATCH');
    const wrongPin = await buyApple(owner, pin, q.body.productId, randomUUID(), randomUUID()).expect(400);
    expect(wrongPin.body.code).toBe('PURCHASE_MISMATCH');
    await buyApple(reader, pin, q.body.productId).expect(404);

    const txId = randomUUID();
    const paid = await buyApple(owner, pin, q.body.productId, txId).expect(200);
    expect(paid.body).toMatchObject({ id: pin.id, status: 'ACTIVE', tier: 'NEARBY' });
    const hours = (new Date(paid.body.expiresAt).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);

    // The app retries until it hears back: same answer.
    const again = await buyApple(owner, pin, q.body.productId, txId).expect(200);
    expect(again.body.expiresAt).toBe(paid.body.expiresAt);

    // One receipt cannot pay for two pins.
    const other = await quote(owner, offsetMeters(base, 300, 0)).expect(201);
    const reused = await buyApple(owner, other.body.pin, other.body.productId, txId).expect(409);
    expect(reused.body.code).toBe('PURCHASE_USED');

    const refunded = await ctx
      .http()
      .post(`/pins/${other.body.pin.id}/purchase`)
      .set(auth(owner))
      .send({ platform: 'apple', signedTransaction: FakeStoreVerifier.appleJws({ transactionId: randomUUID(), productId: other.body.productId, appAccountToken: other.body.pin.id, revocationDate: Date.now() }) })
      .expect(400);
    expect(refunded.body.code).toBe('PURCHASE_REVOKED');
  });

  it('activates a pin with a Google Play purchase and consumes it', async () => {
    const q = await quote(owner, { lat: base.lat + 0.1, lng: base.lng }).expect(201);
    expect(q.body.tier).toBe('CITY');
    const token = `play-${randomUUID()}`;
    store.addGoogle(token, q.body.productId, q.body.pin.id, 2);
    const pending = await ctx.http().post(`/pins/${q.body.pin.id}/purchase`).set(auth(owner)).send({ platform: 'google', productId: q.body.productId, purchaseToken: token }).expect(400);
    expect(pending.body.code).toBe('PURCHASE_INVALID');

    store.addGoogle(token, q.body.productId, q.body.pin.id, 0);
    const paid = await ctx.http().post(`/pins/${q.body.pin.id}/purchase`).set(auth(owner)).send({ platform: 'google', productId: q.body.productId, purchaseToken: token }).expect(200);
    expect(paid.body.status).toBe('ACTIVE');
    expect((new Date(paid.body.expiresAt).getTime() - Date.now()) / 3600_000).toBeGreaterThan(71.9);
    expect(store.consumed).toContain(token);
  });

  it('pays in USDC on the dApp Store build', async () => {
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(owner)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    const signature = Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64');
    await ctx.http().post('/solana/wallet').set(auth(owner)).send({ address, message: Buffer.from(message).toString('base64'), signature }).expect(201);

    const q = await quote(owner, { lat: base.lat + 12, lng: base.lng }).expect(201);
    const pay = await ctx.http().post(`/pins/${q.body.pin.id}/solana/pay`).set(auth(owner)).expect(201);
    expect(pay.body).toMatchObject({ amount: '39.99', token: 'USDC' });
    expect(solana.transfers.at(-1)).toMatchObject({ from: address, to: solana.custodyAddress('escrow'), token: 'USDC', amount: '39990000', memo: `larea:pin:${q.body.pin.id}` });

    const tampered = Buffer.from(JSON.stringify({ kind: 'transfer', input: { amount: '1' } })).toString('base64');
    expect((await ctx.http().post(`/pins/${q.body.pin.id}/solana/submit`).set(auth(owner)).send({ signedTransaction: tampered }).expect(400)).body.code).toBe('TRANSACTION_MISMATCH');

    const done = await ctx.http().post(`/pins/${q.body.pin.id}/solana/submit`).set(auth(owner)).send({ signedTransaction: solana.sign(pay.body.transaction) }).expect(200);
    expect(done.body).toMatchObject({ status: 'ACTIVE', tier: 'WORLD' });
    expect((new Date(done.body.expiresAt).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(6.99);
  });

  it('shows live pins on the map, with whether their chat is in reach', async () => {
    const pinId = await livePin(owner, offsetMeters(base, 150, 150));
    const nearFix = fix(offsetMeters(base, 150, 100));
    const map = await ctx.http().get('/pins/nearby').set(auth(reader)).query({ ...nearFix }).expect(200);
    const mine = map.body.pins.find((p: { id: string }) => p.id === pinId);
    expect(mine).toMatchObject({ eligible: true, mine: false, owner: { id: owner.id } });

    const farFix = fix(offsetMeters(base, 2000, 0));
    const far = await ctx.http().get('/pins/nearby').set(auth(farUser)).query({ ...farFix, viewLat: base.lat, viewLng: base.lng, viewRadiusM: 3000 }).expect(200);
    expect(far.body.pins.find((p: { id: string }) => p.id === pinId)).toMatchObject({ eligible: false });

    const own = await ctx.http().get('/pins/mine').set(auth(owner)).expect(200);
    expect(own.body.pins.map((p: { id: string }) => p.id)).toContain(pinId);
  });

  it('lets people near the pin chat, keeps others out, and lets the owner in from anywhere', async () => {
    const spot = offsetMeters(base, -300, 200);
    const pinId = await livePin(owner, spot, 'Lost cat near the bakery — grey, answers to Miso');
    const near = fix(offsetMeters(spot, 50, 0));
    const ws = await connectWs(ctx, reader);
    const ack = await ws.request<{ type: 'ack'; ok: boolean }>({ type: 'pin_subscribe', pinId, ...near });
    expect(ack.ok).toBe(true);

    const sent = await ctx.http().post(`/pins/${pinId}/messages`).set(auth(reader)).send({ text: 'I saw a grey cat by the school', clientKey: `k-${randomUUID()}`, fix: near }).expect(200);
    expect(sent.body.status).toBe('approved');
    const event = await ws.waitFor<PinEvent>((e) => e.type === 'pin_message');
    expect(event.message).toMatchObject({ pinId, text: 'I saw a grey cat by the school' });

    const farFix = fix(offsetMeters(spot, 2000, 0));
    expect((await ctx.http().get(`/pins/${pinId}/messages`).set(auth(farUser)).query(farFix).expect(403)).body.code).toBe('PIN_TOO_FAR');
    expect((await ctx.http().get(`/pins/${pinId}/messages`).set(auth(farUser)).expect(403)).body.code).toBe('PIN_TOO_FAR');
    expect((await ctx.http().post(`/pins/${pinId}/messages`).set(auth(farUser)).send({ text: 'hello?', clientKey: `k-${randomUUID()}`, fix: farFix }).expect(403)).body.code).toBe('PIN_TOO_FAR');
    const wsFar = await connectWs(ctx, farUser);
    expect((await wsFar.request<{ type: 'ack'; ok: boolean; reason: string }>({ type: 'pin_subscribe', pinId, ...farFix })).reason).toBe('pin_too_far');
    await wsFar.close();

    // The owner runs the chat from wherever they are.
    await ctx.http().post(`/pins/${pinId}/messages`).set(auth(owner)).send({ text: 'Thank you! Heading there.', clientKey: `k-${randomUUID()}` }).expect(200);
    const history = await ctx.http().get(`/pins/${pinId}/messages`).set(auth(owner)).expect(200);
    expect(history.body.messages.map((m: { text: string }) => m.text)).toEqual(['I saw a grey cat by the school', 'Thank you! Heading there.']);

    const blocked = await ctx.http().post(`/pins/${pinId}/messages`).set(auth(reader)).send({ text: '[block2] buy now', clientKey: `k-${randomUUID()}`, fix: near }).expect(200);
    expect(blocked.body.status).toBe('blocked');
    await ws.close();
  });

  it('gives the owner admin tools: hide, ban and edit', async () => {
    const spot = offsetMeters(base, 400, -400);
    const pinId = await livePin(owner, spot, 'Board games tonight in the park');
    // Fresh people: a remembered fix elsewhere would make this one look like teleporting.
    const reader = await user('player');
    const troll = await user('troll');
    const near = fix(offsetMeters(spot, 20, 0));
    const readerWs = await connectWs(ctx, reader);
    const trollWs = await connectWs(ctx, troll);
    expect((await readerWs.request<{ type: 'ack'; ok: boolean }>({ type: 'pin_subscribe', pinId, ...near })).ok).toBe(true);
    expect((await trollWs.request<{ type: 'ack'; ok: boolean }>({ type: 'pin_subscribe', pinId, ...near })).ok).toBe(true);

    const msg = await ctx.http().post(`/pins/${pinId}/messages`).set(auth(troll)).send({ text: 'boring', clientKey: `k-${randomUUID()}`, fix: near }).expect(200);
    const messageId = msg.body.message.id;
    await ctx.http().post(`/pins/${pinId}/messages/${messageId}/hide`).set(auth(reader)).expect(404);
    await ctx.http().post(`/pins/${pinId}/messages/${messageId}/hide`).set(auth(owner)).expect(204);
    expect((await readerWs.waitFor<PinEvent>((e) => e.type === 'pin_message_hidden')).messageId).toBe(messageId);

    await ctx.http().post(`/pins/${pinId}/bans`).set(auth(reader)).send({ userId: troll.id }).expect(404);
    await ctx.http().post(`/pins/${pinId}/bans`).set(auth(owner)).send({ userId: troll.id }).expect(204);
    expect((await trollWs.waitFor<PinEvent>((e) => e.type === 'pin_closed')).reason).toBe('banned');
    expect((await ctx.http().post(`/pins/${pinId}/messages`).set(auth(troll)).send({ text: 'let me in', clientKey: `k-${randomUUID()}`, fix: near }).expect(403)).body.code).toBe('PIN_BANNED');
    expect((await ctx.http().get(`/pins/${pinId}/bans`).set(auth(owner)).expect(200)).body.users.map((u: { id: string }) => u.id)).toEqual([troll.id]);
    const trollMap = await ctx.http().get('/pins/nearby').set(auth(troll)).query(near).expect(200);
    expect(trollMap.body.pins.map((p: { id: string }) => p.id)).not.toContain(pinId);
    await ctx.http().delete(`/pins/${pinId}/bans/${troll.id}`).set(auth(owner)).expect(204);
    await ctx.http().post(`/pins/${pinId}/messages`).set(auth(troll)).send({ text: 'sorry', clientKey: `k-${randomUUID()}`, fix: near }).expect(200);

    await ctx.http().patch(`/pins/${pinId}`).set(auth(reader)).send({ text: 'hijack' }).expect(404);
    const edited = await ctx.http().patch(`/pins/${pinId}`).set(auth(owner)).send({ text: 'Board games moved to 8pm' }).expect(200);
    expect(edited.body).toMatchObject({ text: 'Board games moved to 8pm' });
    expect(edited.body.editedAt).toBeTruthy();
    expect((await readerWs.waitFor<PinEvent>((e) => e.type === 'pin_updated')).text).toBe('Board games moved to 8pm');
    expect((await ctx.http().patch(`/pins/${pinId}`).set(auth(owner)).send({ text: 'crypto giveaway' }).expect(422)).body.code).toBe('PIN_TEXT_REJECTED');
    await ctx.prisma.user.update({ where: { id: owner.id }, data: { mutedUntil: null } });
    await ctx.redis.client.del(`user:snap:${owner.id}`);

    await readerWs.close();
    await trollWs.close();
  });

  it('closes pins when their time is up', async () => {
    const spot = offsetMeters(base, -600, -600);
    const pinId = await livePin(owner, spot);
    const near = fix(spot);
    const reader = await user('late');
    const ws = await connectWs(ctx, reader);
    expect((await ws.request<{ type: 'ack'; ok: boolean }>({ type: 'pin_subscribe', pinId, ...near })).ok).toBe(true);
    await ctx.prisma.pin.update({ where: { id: pinId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const result = await pins.sweep();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await ws.waitFor<PinEvent>((e) => e.type === 'pin_closed' && e.pinId === pinId)).reason).toBe('expired');
    const map = await ctx.http().get('/pins/nearby').set(auth(reader)).query(near).expect(200);
    expect(map.body.pins.map((p: { id: string }) => p.id)).not.toContain(pinId);
    expect((await ctx.http().get(`/pins/${pinId}/messages`).set(auth(owner)).expect(403)).body.code).toBe('PIN_CLOSED');
    await ws.close();
  });

  it('takes a pin down when the App Store refunds it, and after enough reports', async () => {
    const q = await quote(owner, offsetMeters(base, 700, 0)).expect(201);
    const txId = randomUUID();
    await buyApple(owner, q.body.pin, q.body.productId, txId).expect(200);
    await ctx.http().post('/pins/apple/notifications').send({ signedPayload: FakeStoreVerifier.appleNotification('REFUND', txId) }).expect(200, { handled: true });
    expect((await ctx.prisma.pin.findUniqueOrThrow({ where: { id: q.body.pin.id } })).status).toBe('REMOVED');
    await ctx.http().post('/pins/apple/notifications').send({ signedPayload: 'garbage' }).expect(400);

    const reported = await livePin(owner, offsetMeters(base, 800, 0));
    await ctx.http().post(`/pins/${reported}/reports`).set(auth(owner)).send({ reason: 'SPAM' }).expect(400);
    for (let i = 0; i < 3; i++) await ctx.http().post(`/pins/${reported}/reports`).set(auth(await user(`rep${i}`))).send({ reason: 'SPAM' }).expect(200);
    expect((await ctx.prisma.pin.findUniqueOrThrow({ where: { id: reported } })).status).toBe('REMOVED');
  });
});
