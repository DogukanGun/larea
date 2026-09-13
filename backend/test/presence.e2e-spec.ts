import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PresenceService } from '../src/presence/presence.service.js';
import { auth, connectWs, createTestApp, expectWsRejected, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

interface Ack {
  type: 'ack';
  reqId?: string;
  ok: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

/** Offsets a point by metres north / east. */
function offset(base: { lat: number; lng: number }, northM: number, eastM: number) {
  return { lat: base.lat + northM / 111_320, lng: base.lng + eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180)) };
}

describe('presence and realtime', () => {
  let ctx: TestContext;
  let user: TestUser;
  let other: TestUser;
  let square: { id: string; lat: number; lng: number };
  let station: { id: string; lat: number; lng: number };

  beforeAll(async () => {
    ctx = await createTestApp();
    const venues = await ctx.prisma.venue.findMany({ where: { slug: { in: ['main-square', 'central-station'] } } });
    if (venues.length < 2) {
      // The test database may not be seeded: create the two venues used here.
      await ctx.prisma.venue.upsert({ where: { slug: 'main-square' }, update: {}, create: { slug: 'main-square', name: 'Main Square', lat: 52.5219, lng: 13.4132 } });
      await ctx.prisma.venue.upsert({ where: { slug: 'central-station' }, update: {}, create: { slug: 'central-station', name: 'Central Station', lat: 52.52729, lng: 13.4132 } });
    }
    square = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'main-square' } });
    station = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'central-station' } });
    await ctx.prisma.membership.deleteMany({});
    user = await registerUser(ctx);
    other = await registerUser(ctx);
    await verifyAge(ctx, user);
    await verifyAge(ctx, other);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('requires age verification for venue endpoints', async () => {
    const unverified = await registerUser(ctx);
    const res = await ctx.http().get('/venues/nearby').query({ lat: square.lat, lng: square.lng, accuracy: 10 }).set(auth(unverified)).expect(403);
    expect(res.body.code).toBe('AGE_VERIFICATION_REQUIRED');
  });

  it('lists nearby venues with eligibility but without distances', async () => {
    const res = await ctx.http().get('/venues/nearby').query({ lat: square.lat, lng: square.lng, accuracy: 10 }).set(auth(user)).expect(200);
    const names = res.body.venues.map((v: { name: string }) => v.name);
    expect(names[0]).toBe('Main Square');
    expect(names).toContain('Central Station');
    const main = res.body.venues[0];
    expect(main).toMatchObject({ eligible: true, memberCount: 0, distanceM: 0, category: 'square' });
    expect(main.lat).toBeCloseTo(square.lat, 4); // venue coordinates are public; user positions never are
    expect(res.body.attribution).toContain('OpenStreetMap');
    const stationView = res.body.venues.find((v: { name: string }) => v.name === 'Central Station');
    expect(stationView.eligible).toBe(false);

    const imprecise = await ctx.http().get('/venues/nearby').query({ lat: square.lat, lng: square.lng, accuracy: 500 }).set(auth(user)).expect(200);
    expect(imprecise.body.venues[0].eligible).toBe(false);
  });

  it('refuses joins that are imprecise, too far, or mocked', async () => {
    const far = offset(square, 300, 0);
    const tooFar = await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ ...far, accuracy: 10 }).expect(403);
    expect(tooFar.body).toMatchObject({ code: 'TOO_FAR', message: 'You need to be closer to this location to join the chat.' });

    const imprecise = await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 150 }).expect(422);
    expect(imprecise.body.code).toBe('LOCATION_IMPRECISE');

    const mocked = await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 10, mocked: true }).expect(422);
    expect(mocked.body.code).toBe('MOCK_LOCATION');
  });

  it('joins when in range, then replaces the membership when joining another venue', async () => {
    const joined = await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 15 }).expect(201);
    expect(joined.body.venue).toMatchObject({ id: square.id, name: 'Main Square', label: 'General Chat' });
    expect(joined.body.timing).toMatchObject({ heartbeatIntervalSec: 25, staleAfterSec: 120, weakGpsGraceSec: 300 });
    expect(joined.body.memberCount).toBe(1);

    const me = await ctx.http().get('/me').set(auth(user)).expect(200);
    expect(me.body.activeMembership).toMatchObject({ venueId: square.id, venueName: 'Main Square' });

    // Moving 600 m in a few ms would be a teleport; clear the remembered fix like a real 5-minute gap would.
    await ctx.redis.client.del(`fix:${user.id}`);
    const second = await ctx.http().post(`/venues/${station.id}/join`).set(auth(user)).send({ lat: station.lat, lng: station.lng, accuracy: 15 }).expect(201);
    expect(second.body.venue.id).toBe(station.id);

    const memberships = await ctx.prisma.membership.findMany({ where: { userId: user.id }, orderBy: { joinedAt: 'asc' } });
    expect(memberships.map((m) => [m.status, m.endReason])).toEqual([
      ['ENDED', 'REPLACED'],
      ['ACTIVE', null],
    ]);

    await ctx.http().post(`/venues/${station.id}/leave`).set(auth(user)).expect(204);
    expect(await ctx.prisma.membership.count({ where: { userId: user.id, status: 'ACTIVE' } })).toBe(0);
  });

  it('rejects the websocket upgrade without a valid token', async () => {
    expect(await expectWsRejected(ctx, {})).toBe(401);
    expect(await expectWsRejected(ctx, { Authorization: 'Bearer nope' })).toBe(401);
  });

  it('runs the heartbeat lifecycle: eligible → outside twice → removed, with presence updates', async () => {
    await ctx.redis.client.del(`fix:${user.id}`, `fix:${other.id}`);
    await ctx.http().post(`/venues/${square.id}/join`).set(auth(other)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
    const watcher = await connectWs(ctx, other);
    expect((await watcher.request<Ack>({ type: 'join', venueId: square.id })).ok).toBe(true);

    const ws = await connectWs(ctx, user);
    const notMember = await ws.request<Ack>({ type: 'join', venueId: square.id });
    expect(notMember).toMatchObject({ ok: false, reason: 'not_member' });

    await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
    const presenceUp = await watcher.waitFor<{ type: 'presence'; count: number }>((e) => e.type === 'presence' && e.count === 2);
    expect(presenceUp.count).toBe(2);

    const joinAck = await ws.request<Ack>({ type: 'join', venueId: square.id });
    expect(joinAck.ok).toBe(true);
    expect(joinAck.data).toMatchObject({ memberCount: 2 });

    const hb1 = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, lat: square.lat, lng: square.lng, accuracy: 10 });
    expect(hb1.data).toMatchObject({ state: 'eligible', removed: false });

    const weak = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, lat: square.lat, lng: square.lng, accuracy: 180 });
    expect(weak.data).toMatchObject({ state: 'weak_gps', removed: false });

    const far = offset(square, 500, 0);
    // Real heartbeats are 25 s apart; walking 500 m between two is plausible. Simulate the elapsed time.
    await ctx.redis.client.del(`fix:${user.id}`);
    const out1 = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, ...far, accuracy: 20 });
    expect(out1.data).toMatchObject({ state: 'outside', removed: false });
    await ctx.redis.client.del(`fix:${user.id}`);
    const out2 = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, ...far, accuracy: 20 });
    expect(out2.data).toMatchObject({ state: 'outside', removed: true });

    const removed = await ws.waitFor<{ type: 'removed'; reason: string; message: string }>((e) => e.type === 'removed');
    expect(removed).toMatchObject({ reason: 'out_of_range', message: "You're no longer near this location. You've been removed from the chat." });
    const presenceDown = await watcher.waitFor<{ type: 'presence'; count: number }>((e) => e.type === 'presence' && e.count === 1);
    expect(presenceDown.count).toBe(1);

    const membership = await ctx.prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { joinedAt: 'desc' } });
    expect(membership).toMatchObject({ status: 'ENDED', endReason: 'OUT_OF_RANGE' });

    const afterRemoval = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, lat: square.lat, lng: square.lng, accuracy: 10 });
    expect(afterRemoval).toMatchObject({ ok: false, reason: 'not_member' });

    const pong = await ws.request<{ type: string }>({ type: 'ping' });
    expect(pong.type).toBe('pong');
    const bad = await ws.request<{ type: string; code: string }>({ type: 'heartbeat', venueId: square.id, lat: 999, lng: 0, accuracy: 1 });
    expect(bad).toMatchObject({ type: 'error', code: 'BAD_MESSAGE' });

    await ws.close();
    await watcher.close();
  });

  it('ignores mocked and implausible fixes without changing eligibility', async () => {
    await ctx.redis.client.del(`fix:${user.id}`);
    await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
    const ws = await connectWs(ctx, user);
    await ws.request<Ack>({ type: 'join', venueId: square.id });

    const mocked = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, lat: square.lat, lng: square.lng, accuracy: 10, mocked: true });
    expect(mocked.data).toMatchObject({ state: 'ignored' });
    expect(mocked.reason).toBe('mock_location');

    const teleport = await ws.request<Ack>({ type: 'heartbeat', venueId: square.id, lat: square.lat + 0.5, lng: square.lng, accuracy: 10 });
    expect(teleport.data).toMatchObject({ state: 'ignored' });
    expect(teleport.reason).toBe('implausible_movement');

    expect(await ctx.prisma.membership.count({ where: { userId: user.id, status: 'ACTIVE' } })).toBe(1);
    await ws.close();
  });

  it('sweeps stale and unconfirmed memberships and notifies the user', async () => {
    const presence = ctx.app.get(PresenceService);
    await ctx.redis.client.del(`fix:${user.id}`, 'lock:presence-sweep');
    const ws = await connectWs(ctx, user);
    const membership = await ctx.prisma.membership.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' } });

    await ctx.prisma.membership.update({ where: { id: membership.id }, data: { lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const result = await presence.sweep();
    expect(result.stale).toBe(1);
    const removed = await ws.waitFor<{ type: 'removed'; reason: string }>((e) => e.type === 'removed');
    expect(removed.reason).toBe('stale');

    // Weak GPS for too long → unconfirmed
    await ctx.http().post(`/venues/${square.id}/join`).set(auth(user)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
    const m2 = await ctx.prisma.membership.findFirstOrThrow({ where: { userId: user.id, status: 'ACTIVE' } });
    await ctx.prisma.membership.update({ where: { id: m2.id }, data: { lastEligibleAt: new Date(Date.now() - 6 * 60 * 1000) } });
    await ctx.redis.client.del('lock:presence-sweep');
    expect((await presence.sweep()).unconfirmed).toBe(1);
    const removed2 = await ws.waitFor<{ type: 'removed'; reason: string }>((e) => e.type === 'removed');
    expect(removed2.reason).toBe('unconfirmed');

    // Sweep lock prevents a second instance from running concurrently
    expect(await presence.sweep()).toEqual({ stale: 0, unconfirmed: 0, closed: 0 });
    await ws.close();
  });

  it('closes sockets when the account is deleted', async () => {
    const doomed = await registerUser(ctx);
    const ws = await connectWs(ctx, doomed);
    const closed = new Promise<number>((resolve) => ws.socket.once('close', (code) => resolve(code)));
    await ctx.http().delete('/me').set(auth(doomed)).expect(204);
    expect(await closed).toBe(4401);
  });
});
