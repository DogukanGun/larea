import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import { StampsService } from '../src/solana/stamps.service.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { auth, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

const SOLANA = { 'X-Larea-Build': 'solana' };

describe('check-in stamps', () => {
  let ctx: TestContext;
  let fake: FakeSolanaClient;
  let venue: { id: string; lat: number; lng: number };
  let fix: { lat: number; lng: number; accuracy: number };

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get(SOLANA_CLIENT);
    // A place of our own far from the shared fixtures, so other suites' memberships don't matter.
    venue = await ctx.prisma.venue.create({ data: { slug: `stamp-${randomUUID().slice(0, 8)}`, name: 'Stamp Café', category: 'cafe', lat: -60 - Math.random() * 5, lng: -150 + Math.random() * 60 } });
    fix = { lat: venue.lat, lng: venue.lng, accuracy: 10 };
  });

  afterAll(async () => {
    await ctx?.prisma.venue.deleteMany({ where: { id: venue?.id } });
    await ctx?.close();
  });

  async function walletUser(): Promise<TestUser & { address: string }> {
    const user = await registerUser(ctx);
    await verifyAge(ctx, user);
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(user)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    await ctx
      .http()
      .post('/solana/wallet')
      .set(auth(user))
      .send({
        address,
        message: Buffer.from(message).toString('base64'),
        signature: Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64'),
      })
      .expect(201);
    return { ...user, address };
  }

  it('needs a linked wallet', async () => {
    const user = await registerUser(ctx);
    await verifyAge(ctx, user);
    const res = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(409);
    expect(res.body.code).toBe('WALLET_REQUIRED');
  });

  it('checks in, mints a stamp and unlocks the chat for the Solana build', async () => {
    const user = await walletUser();

    // The Solana build needs a stamp; other builds join by location alone.
    const gated = await ctx.http().post(`/venues/${venue.id}/join`).set(auth(user)).set(SOLANA).send(fix).expect(403);
    expect(gated.body.code).toBe('STAMP_REQUIRED');

    const mocked = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send({ ...fix, mocked: true }).expect(422);
    expect(mocked.body.code).toBe('MOCK_LOCATION');

    const checkin = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(201);
    expect(checkin.body).toMatchObject({ cluster: 'localnet', stamp: { status: 'PENDING', visit: 1, venueName: 'Stamp Café' } });
    const stampId = checkin.body.stamp.id as string;

    // A transaction that isn't the prepared one is refused.
    const tampered = Buffer.from(Buffer.from(checkin.body.transaction, 'base64').toString().replace('Stamp', 'Stomp')).toString('base64');
    const bad = await ctx.http().post(`/solana/stamps/${stampId}/submit`).set(auth(user)).send({ signedTransaction: tampered }).expect(400);
    expect(bad.body.code).toBe('TRANSACTION_MISMATCH');

    const confirmed = await ctx.http().post(`/solana/stamps/${stampId}/submit`).set(auth(user)).send({ signedTransaction: fake.sign(checkin.body.transaction) }).expect(201);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', visit: 1 });
    expect(confirmed.body.assetId).toBeTruthy();
    expect(confirmed.body.unlocksUntil).toBeTruthy();

    await ctx.http().post(`/venues/${venue.id}/join`).set(auth(user)).set(SOLANA).send(fix).expect(201);

    const again = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(409);
    expect(again.body.code).toBe('ALREADY_STAMPED');

    const status = await ctx.http().get(`/venues/${venue.id}/stamp`).set(auth(user)).expect(200);
    expect(status.body).toMatchObject({ unlocked: true, checkedInToday: true, visits: 1, pending: null });

    const mine = await ctx.http().get('/solana/stamps').set(auth(user)).expect(200);
    expect(mine.body).toMatchObject({ dasChecked: false, stamps: [{ id: stampId, onChain: null }] });
    fake.das = new Map([[user.address, [confirmed.body.assetId]]]);
    const checked = await ctx.http().get('/solana/stamps').set(auth(user)).expect(200);
    expect(checked.body).toMatchObject({ dasChecked: true, stamps: [{ id: stampId, onChain: true }] });
    fake.das = null;

    // Public metadata for wallets and explorers.
    const meta = await ctx.http().get(`/solana/metadata/stamps/${stampId}.json`).expect(200);
    expect(meta.body).toMatchObject({ symbol: 'LAREA', name: 'Stamp Café · 1' });
    const svg = await ctx.http().get(`/solana/metadata/stamps/${stampId}.svg`).expect(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    await ctx.http().get('/solana/metadata/stamps.json').expect(200);
  });

  it('confirms a check-in the wallet sent itself, later through the sweeper', async () => {
    const user = await walletUser();
    const checkin = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(201);
    fake.landNext = 'pending';
    const signature = fake.sendFromWallet(checkin.body.transaction);
    fake.landNext = 'confirmed';
    const pending = await ctx.http().post(`/solana/stamps/${checkin.body.stamp.id}/confirm`).set(auth(user)).send({ signature }).expect(201);
    expect(pending.body.status).toBe('PENDING');

    // While it is in flight, a second check-in waits for it.
    const busy = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(409);
    expect(busy.body.code).toBe('CHECKIN_PENDING');

    fake.land(signature);
    const swept = await ctx.app.get(StampsService).sweep();
    expect(swept.confirmed).toBeGreaterThanOrEqual(1);
    const status = await ctx.http().get(`/venues/${venue.id}/stamp`).set(auth(user)).expect(200);
    expect(status.body).toMatchObject({ unlocked: true, visits: 1 });
  });

  it('fails check-ins that were never signed once they expire', async () => {
    const user = await walletUser();
    const checkin = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(201);
    await ctx.app.get(StampsService).sweep(new Date(Date.now() + 3600_000));
    const stamp = await ctx.prisma.stamp.findUniqueOrThrow({ where: { id: checkin.body.stamp.id } });
    expect(stamp).toMatchObject({ status: 'FAILED', error: 'expired before signing' });
  });
});
