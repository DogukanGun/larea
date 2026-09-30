import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

const SOLANA = { 'X-Larea-Build': 'solana' };

interface MessageEvent {
  type: 'message';
  message: { id: string; text: string; room?: string; authorLevel?: number };
}

describe('loyalty levels and the Regulars room', () => {
  let ctx: TestContext;
  let fake: FakeSolanaClient;
  let venue: { id: string; lat: number; lng: number };
  let fix: { lat: number; lng: number; accuracy: number };

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get(SOLANA_CLIENT);
    venue = await ctx.prisma.venue.create({ data: { slug: `loyal-${randomUUID().slice(0, 8)}`, name: 'Loyal Bar', category: 'cafe', lat: -60 - Math.random() * 5, lng: -150 + Math.random() * 60 } });
    fix = { lat: venue.lat, lng: venue.lng, accuracy: 10 };
  });

  afterAll(async () => {
    await ctx?.prisma.venue.deleteMany({ where: { id: venue?.id } });
    await ctx?.close();
  });

  /** A verified user with a linked wallet and `past` confirmed stamps here from earlier days. */
  async function member(past: number): Promise<TestUser> {
    const user = await registerUser(ctx);
    await verifyAge(ctx, user);
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(user)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    const signature = Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64');
    await ctx.http().post('/solana/wallet').set(auth(user)).send({ address, message: Buffer.from(message).toString('base64'), signature }).expect(201);
    for (let i = 1; i <= past; i++) {
      const day = new Date(Date.now() - (i + 1) * 86_400_000);
      await ctx.prisma.stamp.create({
        data: { userId: user.id, venueId: venue.id, wallet: address, day: day.toISOString().slice(0, 10), visit: past - i + 1, status: 'CONFIRMED', messageHash: 'seed', expiresAt: day, confirmedAt: day },
      });
    }
    return user;
  }

  async function checkInAndJoin(user: TestUser) {
    const checkin = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(user)).send(fix).expect(201);
    const stamp = await ctx.http().post(`/solana/stamps/${checkin.body.stamp.id}/submit`).set(auth(user)).send({ signedTransaction: fake.sign(checkin.body.transaction) }).expect(201);
    await ctx.http().post(`/venues/${venue.id}/join`).set(auth(user)).set(SOLANA).send(fix).expect(201);
    return stamp.body;
  }

  const send = (user: TestUser, text: string, room?: string) =>
    ctx.http().post(`/venues/${venue.id}/messages`).set(auth(user)).set(SOLANA).send({ text, room, clientKey: randomUUID() });

  it('mints the level badge with the check-in that reaches Regular and counts levels per place', async () => {
    const regular = await member(4);
    const stamp = await checkInAndJoin(regular);
    expect(stamp).toMatchObject({ status: 'CONFIRMED', visit: 5, levelMinted: 2 });
    const row = await ctx.prisma.stamp.findUniqueOrThrow({ where: { id: stamp.id } });
    expect(row.levelAssetId).toBeTruthy();
    expect(row.levelAssetId).not.toBe(row.assetId);

    const status = await ctx.http().get(`/venues/${venue.id}/stamp`).set(auth(regular)).expect(200);
    expect(status.body.loyalty).toMatchObject({ stamps: 5, level: 2, levelName: 'Regular', nextLevelAt: 15 });
    const levels = await ctx.http().get('/solana/levels').set(auth(regular)).expect(200);
    expect(levels.body).toMatchObject({ thresholds: [5, 15, 40], levels: [{ venueId: venue.id, level: 2 }] });

    const badge = await ctx.http().get(`/solana/metadata/levels/${stamp.id}.json`).expect(200);
    expect(badge.body.name).toBe('Regular · Loyal Bar');

    const visitor = await member(0);
    expect((await checkInAndJoin(visitor)).levelMinted).toBeNull();
  });

  it('lets only Regulars use the Regulars room, and fans it out to Regulars on the Solana build only', async () => {
    const author = await member(5);
    const regular = await member(5);
    const regularElsewhere = await member(5);
    const visitor = await member(0);
    for (const u of [author, regular, regularElsewhere, visitor]) await checkInAndJoin(u);

    const wsRegular = await connectWs(ctx, regular, SOLANA);
    const wsPlain = await connectWs(ctx, regularElsewhere);
    const wsVisitor = await connectWs(ctx, visitor, SOLANA);
    for (const ws of [wsRegular, wsPlain, wsVisitor]) expect((await ws.request<{ type: 'ack'; ok: boolean }>({ type: 'join', venueId: venue.id })).ok).toBe(true);

    const denied = await send(visitor, 'let me in', 'REGULARS').expect(403);
    expect(denied.body.code).toBe('LEVEL_REQUIRED');

    const inside = await send(author, 'regulars only', 'REGULARS').expect(200);
    expect(inside.body.message).toMatchObject({ room: 'REGULARS', authorLevel: 2 });
    const main = await send(author, 'hello everyone').expect(200);
    expect(main.body.message.room).toBeUndefined();

    const got = await wsRegular.waitFor<MessageEvent>((e) => e.type === 'message' && e.message.id === inside.body.message.id);
    expect(got.message.room).toBe('REGULARS');
    for (const ws of [wsPlain, wsVisitor]) {
      await ws.waitFor<MessageEvent>((e) => e.type === 'message' && e.message.id === main.body.message.id);
      await expect(ws.waitFor<MessageEvent>((e) => e.type === 'message' && e.message.id === inside.body.message.id, 300)).rejects.toThrow();
    }

    const history = await ctx.http().get(`/venues/${venue.id}/messages`).query({ room: 'REGULARS' }).set(auth(regular)).expect(200);
    expect(history.body.messages.map((m: { id: string }) => m.id)).toEqual([inside.body.message.id]);
    const mainHistory = await ctx.http().get(`/venues/${venue.id}/messages`).set(auth(regular)).expect(200);
    expect(mainHistory.body.messages.map((m: { id: string }) => m.id)).not.toContain(inside.body.message.id);
    await ctx.http().get(`/venues/${venue.id}/messages`).query({ room: 'REGULARS' }).set(auth(visitor)).expect(403);

    await Promise.all([wsRegular.close(), wsPlain.close(), wsVisitor.close()]);
  });

  it('keeps polls for Regulars in the Solana build only', async () => {
    const visitor = await member(0);
    await checkInAndJoin(visitor);
    const poll = { question: 'Music tonight?', options: ['Jazz', 'Techno'] };
    const gated = await ctx.http().post(`/venues/${venue.id}/polls`).set(auth(visitor)).set(SOLANA).send({ ...poll, clientKey: randomUUID() }).expect(403);
    expect(gated.body.code).toBe('LEVEL_REQUIRED');
    // Other builds keep polls open to everyone present.
    await ctx.http().post(`/venues/${venue.id}/polls`).set(auth(visitor)).send({ ...poll, clientKey: randomUUID() }).expect(200);
  });
});
