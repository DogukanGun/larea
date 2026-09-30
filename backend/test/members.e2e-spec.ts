import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

describe('chat participants', () => {
  let ctx: TestContext;
  let anna: TestUser;
  let ben: TestUser;
  let carl: TestUser;
  let venue: { id: string; lat: number; lng: number };

  const join = (u: TestUser) =>
    ctx.http().post(`/venues/${venue.id}/join`).set(auth(u)).send({ lat: venue.lat, lng: venue.lng, accuracy: 10 }).expect(201);
  const members = (u: TestUser) => ctx.http().get(`/venues/${venue.id}/members`).set(auth(u));

  beforeAll(async () => {
    ctx = await createTestApp();
    const slug = `members-${randomUUID().slice(0, 8)}`;
    venue = await ctx.prisma.venue.create({ data: { slug, name: 'Members Park', category: 'park', lat: 48.15, lng: 11.58 } });
    anna = await registerUser(ctx, { displayName: `anna_${randomUUID().slice(0, 6)}` });
    ben = await registerUser(ctx, { displayName: `ben_${randomUUID().slice(0, 6)}` });
    carl = await registerUser(ctx, { displayName: `carl_${randomUUID().slice(0, 6)}` });
    for (const u of [anna, ben, carl]) await verifyAge(ctx, u);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('is only visible to members and lists everyone present by name', async () => {
    const outside = await members(anna).expect(403);
    expect(outside.body.code).toBe('NOT_MEMBER');

    await join(anna);
    const alone = await members(anna).expect(200);
    expect(alone.body).toEqual({ members: [{ id: anna.id, displayName: anna.displayName }], count: 1 });

    await join(ben);
    await join(carl);
    const three = await members(anna).expect(200);
    expect(three.body.count).toBe(3);
    expect(three.body.members.map((m: { displayName: string }) => m.displayName)).toEqual(
      [anna, ben, carl].map((u) => u.displayName).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
    // Nothing but id and display name leaves the server: no join times, no fixes.
    expect(Object.keys(three.body.members[0]).sort()).toEqual(['displayName', 'id']);
  });

  it('hides blocked pairs from each other but keeps the true head count', async () => {
    await ctx.http().post(`/users/${ben.id}/block`).set(auth(anna)).expect(204);
    const forAnna = await members(anna).expect(200);
    expect(forAnna.body.members.map((m: { id: string }) => m.id)).not.toContain(ben.id);
    expect(forAnna.body.count).toBe(3);
    const forBen = await members(ben).expect(200);
    expect(forBen.body.members.map((m: { id: string }) => m.id)).not.toContain(anna.id);
    const forCarl = await members(carl).expect(200);
    expect(forCarl.body.members).toHaveLength(3);
    await ctx.http().delete(`/users/${ben.id}/block`).set(auth(anna)).expect(204);
  });

  it('drops people who left', async () => {
    await ctx.http().post(`/venues/${venue.id}/leave`).set(auth(carl)).expect(204);
    const res = await members(anna).expect(200);
    expect(res.body.count).toBe(2);
    expect(res.body.members.map((m: { id: string }) => m.id).sort()).toEqual([anna.id, ben.id].sort());
    const gone = await members(carl).expect(403);
    expect(gone.body.code).toBe('NOT_MEMBER');
  });

  it('advertises backend features on /me', async () => {
    const me = await ctx.http().get('/me').set(auth(anna)).expect(200);
    expect(me.body.features).toEqual({ images: true, polls: true, market: true, payments: true, solana: true });
    expect(me.body.walletAddress).toBeNull();
  });
});
