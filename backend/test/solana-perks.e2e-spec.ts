import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PerksService } from '../src/solana/perks.service.js';
import { RewardsService } from '../src/solana/rewards.service.js';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { auth, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

describe('SKR rewards and moderator perks', () => {
  let ctx: TestContext;
  let fake: FakeSolanaClient;
  let venue: { id: string; lat: number; lng: number };
  let fix: { lat: number; lng: number; accuracy: number };
  let moderator: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get(SOLANA_CLIENT);
    venue = await ctx.prisma.venue.create({ data: { slug: `perk-${randomUUID().slice(0, 8)}`, name: 'Perk Pub', lat: -60 - Math.random() * 5, lng: -150 + Math.random() * 60 } });
    fix = { lat: venue.lat, lng: venue.lng, accuracy: 10 };
    moderator = await registerUser(ctx);
    await ctx.prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
    await ctx.redis.client.del(`user:snap:${moderator.id}`);
  });

  afterAll(async () => {
    await ctx?.prisma.venue.deleteMany({ where: { id: venue?.id } });
    await ctx?.close();
  });

  /** A verified user with a wallet and `past` confirmed stamps here from earlier days. */
  async function holder(past: number): Promise<TestUser & { address: string }> {
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
      await ctx.prisma.stamp.create({ data: { userId: user.id, venueId: venue.id, wallet: address, day: day.toISOString().slice(0, 10), visit: i, status: 'CONFIRMED', messageHash: 'seed', expiresAt: day, confirmedAt: day } });
    }
    return { ...user, address };
  }

  it('pays SKR once when a check-in reaches a new level, retrying a failed payout', async () => {
    const regular = await holder(4);
    fake.failCustody = true;
    const checkin = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(regular)).send(fix).expect(201);
    await ctx.http().post(`/solana/stamps/${checkin.body.stamp.id}/submit`).set(auth(regular)).send({ signedTransaction: fake.sign(checkin.body.transaction) }).expect(201);

    const pending = await ctx.http().get('/solana/rewards').set(auth(regular)).expect(200);
    expect(pending.body.rewards).toMatchObject([{ level: 2, levelName: 'Regular', amount: '5', status: 'PENDING' }]);

    await ctx.app.get(RewardsService).sweep();
    const sent = await ctx.http().get('/solana/rewards').set(auth(regular)).expect(200);
    expect(sent.body.rewards[0]).toMatchObject({ status: 'SENT', signature: expect.any(String) });
    expect(fake.custodySent.at(-1)).toMatchObject({ wallet: 'rewards', to: regular.address, token: 'SKR', amount: '5000000' });

    // Visitors (the first stamp) get no reward.
    const visitor = await holder(0);
    const first = await ctx.http().post(`/venues/${venue.id}/checkin`).set(auth(visitor)).send(fix).expect(201);
    await ctx.http().post(`/solana/stamps/${first.body.stamp.id}/submit`).set(auth(visitor)).send({ signedTransaction: fake.sign(first.body.transaction) }).expect(201);
    expect((await ctx.http().get('/solana/rewards').set(auth(visitor)).expect(200)).body.rewards).toEqual([]);
  });

  it('lets moderators run perks that holders of the level see and claim once', async () => {
    const regular = await holder(5);
    const visitor = await holder(1);
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();

    await ctx.http().post('/admin/perks').set(auth(regular)).send({ venueId: venue.id, kind: 'NOTICE', title: 'Free coffee', minLevel: 2, endsAt }).expect(403);
    const notice = await ctx.http().post('/admin/perks').set(auth(moderator)).send({ venueId: venue.id, kind: 'NOTICE', title: 'Free coffee', description: 'Show your badge at the bar.', minLevel: 2, endsAt }).expect(201);
    const drop = await ctx.http().post('/admin/perks').set(auth(moderator)).send({ venueId: venue.id, kind: 'SKR_DROP', title: 'Autumn drop', minLevel: 2, amount: '2.5', maxClaims: 1, endsAt }).expect(201);
    await ctx.http().post('/admin/perks').set(auth(moderator)).send({ venueId: venue.id, kind: 'SKR_DROP', title: 'Broken', minLevel: 2, endsAt }).expect(400);

    const seen = await ctx.http().get(`/venues/${venue.id}/perks`).set(auth(regular)).expect(200);
    expect(seen.body.perks.map((p: { id: string }) => p.id).sort()).toEqual([notice.body.id, drop.body.id].sort());
    expect(seen.body.perks.every((p: { eligible: boolean }) => p.eligible)).toBe(true);
    const visitorView = await ctx.http().get(`/venues/${venue.id}/perks`).set(auth(visitor)).expect(200);
    expect(visitorView.body.perks.every((p: { eligible: boolean }) => !p.eligible)).toBe(true);

    const denied = await ctx.http().post(`/solana/perks/${drop.body.id}/claim`).set(auth(visitor)).expect(403);
    expect(denied.body.code).toBe('LEVEL_REQUIRED');
    await ctx.http().post(`/solana/perks/${notice.body.id}/claim`).set(auth(regular)).expect(400);
    const claimed = await ctx.http().post(`/solana/perks/${drop.body.id}/claim`).set(auth(regular)).expect(200);
    expect(claimed.body).toMatchObject({ claimed: true, amount: '2.5', signature: expect.any(String) });
    expect(fake.custodySent.at(-1)).toMatchObject({ wallet: 'rewards', to: regular.address, token: 'SKR', amount: '2500000' });
    const twice = await ctx.http().post(`/solana/perks/${drop.body.id}/claim`).set(auth(regular)).expect(409);
    expect(twice.body.code).toBe('ALREADY_CLAIMED');

    const another = await holder(5);
    const empty = await ctx.http().post(`/solana/perks/${drop.body.id}/claim`).set(auth(another)).expect(409);
    expect(empty.body.code).toBe('DROP_EMPTY');

    const listed = await ctx.http().get('/admin/perks').query({ venueId: venue.id }).set(auth(moderator)).expect(200);
    expect(listed.body.find((p: { id: string }) => p.id === drop.body.id)).toMatchObject({ claims: 1, maxClaims: 1 });
    await ctx.http().delete(`/admin/perks/${notice.body.id}`).set(auth(moderator)).expect(204);
    const after = await ctx.http().get(`/venues/${venue.id}/perks`).set(auth(regular)).expect(200);
    expect(after.body.perks.map((p: { id: string }) => p.id)).toEqual([drop.body.id]);
    expect(await ctx.app.get(PerksService).sweep()).toBe(0);
  });
});
