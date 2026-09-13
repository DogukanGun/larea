import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

interface Ack {
  type: 'ack';
  ok: boolean;
}

describe('messages, moderation, blocks and enforcement', () => {
  let ctx: TestContext;
  let anna: TestUser;
  let ben: TestUser;
  let square: { id: string; lat: number; lng: number };

  const joinSquare = (u: TestUser) =>
    ctx.http().post(`/venues/${square.id}/join`).set(auth(u)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
  const send = (u: TestUser, text: string, clientKey = randomUUID()) =>
    ctx.http().post(`/venues/${square.id}/messages`).set(auth(u)).send({ text, clientKey });
  const unmute = async (u: TestUser) => {
    await ctx.prisma.user.update({ where: { id: u.id }, data: { mutedUntil: null } });
    await ctx.redis.client.del(`user:snap:${u.id}`);
  };
  const sendExpect = async (u: TestUser, text: string, status: number, clientKey = randomUUID()) => {
    const res = await send(u, text, clientKey);
    if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
    return res;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.prisma.venue.upsert({ where: { slug: 'main-square' }, update: {}, create: { slug: 'main-square', name: 'Main Square', lat: 52.5219, lng: 13.4132 } });
    square = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'main-square' } });
    await ctx.prisma.message.deleteMany({ where: { venueId: square.id } });
    anna = await registerUser(ctx, { displayName: `anna_${randomUUID().slice(0, 6)}` });
    ben = await registerUser(ctx, { displayName: `ben_${randomUUID().slice(0, 6)}` });
    await verifyAge(ctx, anna);
    await verifyAge(ctx, ben);
    await joinSquare(anna);
    await joinSquare(ben);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('rejects reserved display names at registration and on update', async () => {
    const res = await ctx.http().post('/auth/register').send({ email: `x-${randomUUID()}@example.test`, password: 'correct-horse-battery', displayName: 'Police Berlin' }).expect(400);
    expect(res.body.code).toBe('DISPLAY_NAME_REJECTED');
    const upd = await ctx.http().patch('/me').set(auth(anna)).send({ displayName: 'the moderator' }).expect(400);
    expect(upd.body.code).toBe('DISPLAY_NAME_REJECTED');
  });

  it('delivers a safe message to the room, including the sender, and stores it', async () => {
    const wsAnna = await connectWs(ctx, anna);
    const wsBen = await connectWs(ctx, ben);
    expect((await wsAnna.request<Ack>({ type: 'join', venueId: square.id })).ok).toBe(true);
    expect((await wsBen.request<Ack>({ type: 'join', venueId: square.id })).ok).toBe(true);

    const key = randomUUID();
    const res = await sendExpect(anna, 'Anyone want to get food?', 200, key);
    expect(res.body.status).toBe('approved');
    expect(res.body.message).toMatchObject({ text: 'Anyone want to get food?', status: 'APPROVED', author: { id: anna.id, displayName: anna.displayName } });
    expect(res.body.notice).toBeUndefined();

    const seenByBen = await wsBen.waitFor<{ type: 'message'; message: { id: string } }>((e) => e.type === 'message');
    expect(seenByBen.message.id).toBe(res.body.message.id);
    const seenByAnna = await wsAnna.waitFor<{ type: 'message'; message: { id: string } }>((e) => e.type === 'message');
    expect(seenByAnna.message.id).toBe(res.body.message.id);

    // Idempotent resend returns the same message without a second delivery
    const again = await sendExpect(anna, 'Anyone want to get food?', 200, key);
    expect(again.body.message.id).toBe(res.body.message.id);
    await expect(wsBen.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);

    const history = await ctx.http().get(`/venues/${square.id}/messages`).set(auth(ben)).expect(200);
    expect(history.body.messages.map((m: { id: string }) => m.id)).toContain(res.body.message.id);

    await wsAnna.close();
    await wsBen.close();
  });

  it('blocks a threat, records a severe violation, mutes for 24h and opens an incident', async () => {
    const wsBen = await connectWs(ctx, ben);
    await wsBen.request<Ack>({ type: 'join', venueId: square.id });
    const wsAnna = await connectWs(ctx, anna);

    const res = await sendExpect(anna, "I know where you live. I'm coming to your house.", 200);
    expect(res.body).toEqual({ status: 'blocked', notice: "This message doesn't meet our community guidelines." });
    await expect(wsBen.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);

    const enforcement = await wsAnna.waitFor<{ type: 'enforcement'; kind: string; until: string }>((e) => e.type === 'enforcement');
    expect(enforcement.kind).toBe('mute');
    expect(new Date(enforcement.until).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);

    const stored = await ctx.prisma.message.findFirst({ where: { authorId: anna.id, status: 'BLOCKED' } });
    expect(stored).toMatchObject({ severity: 3, categories: ['threat'] });
    expect(await ctx.prisma.violation.count({ where: { userId: anna.id, severity: 3 } })).toBe(1);
    expect(await ctx.prisma.incident.count({ where: { userId: anna.id, kind: 'SEVERE_CONTENT', status: 'OPEN' } })).toBe(1);

    const me = await ctx.http().get('/me').set(auth(anna)).expect(200);
    expect(me.body.mutedUntil).not.toBeNull();
    const muted = await sendExpect(anna, 'hello again', 403);
    expect(muted.body.code).toBe('MUTED');

    await unmute(anna);
    await wsAnna.close();
    await wsBen.close();
  });

  it('censors mild profanity and warns without hiding the message', async () => {
    const censored = await sendExpect(anna, 'this is damn good', 200);
    expect(censored.body.status).toBe('censored');
    expect(censored.body.message.text).toBe('this is d*** good');
    expect(censored.body.notice).toMatch(/masked/);
    const row = await ctx.prisma.message.findUniqueOrThrow({ where: { id: censored.body.message.id } });
    expect(row.originalText).toBe('this is damn good');

    const warned = await sendExpect(ben, 'hey [warn]', 200);
    expect(warned.body.status).toBe('approved');
    expect(warned.body.notice).toMatch(/respectful/);
  });

  it('fails closed when moderation is unavailable', async () => {
    const res = await sendExpect(ben, 'hello [unavailable]', 503);
    expect(res.body).toMatchObject({ code: 'MODERATION_UNAVAILABLE', message: "We couldn't check your message. Please try again." });
    expect(await ctx.prisma.message.count({ where: { authorId: ben.id, text: { contains: 'unavailable' } } })).toBe(0);
  });

  it('refuses to post when not present or muted, and validates input', async () => {
    const outsider = await registerUser(ctx);
    await verifyAge(ctx, outsider);
    const notPresent = await sendExpect(outsider, 'hi', 403);
    expect(notPresent.body.code).toBe('NOT_PRESENT');
    await ctx.http().get(`/venues/${square.id}/messages`).set(auth(outsider)).expect(403);

    const tooLong = await sendExpect(anna, 'x'.repeat(501), 400);
    expect(tooLong.body.code).toBe('VALIDATION');
    const badKey = await ctx.http().post(`/venues/${square.id}/messages`).set(auth(anna)).send({ text: 'hi', clientKey: 'short' }).expect(400);
    expect(badKey.body.code).toBe('VALIDATION');
  });

  it('hides messages both ways between blocked users, live and in history', async () => {
    await unmute(anna); // the censored message above earned a one-hour mute (strike total 4)
    await ctx.http().post(`/users/${ben.id}/block`).set(auth(anna)).expect(204);
    const list = await ctx.http().get('/me/blocks').set(auth(anna)).expect(200);
    expect(list.body.blocks.map((b: { id: string }) => b.id)).toEqual([ben.id]);

    const wsAnna = await connectWs(ctx, anna);
    const wsBen = await connectWs(ctx, ben);
    await wsAnna.request<Ack>({ type: 'join', venueId: square.id });
    await wsBen.request<Ack>({ type: 'join', venueId: square.id });

    const fromBen = await sendExpect(ben, 'ben says hi', 200);
    expect(fromBen.body.status).toBe('approved');
    await expect(wsAnna.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);
    const benSeesOwn = await wsBen.waitFor<{ type: 'message'; message: { id: string } }>((e) => e.type === 'message');
    expect(benSeesOwn.message.id).toBe(fromBen.body.message.id);

    const fromAnna = await sendExpect(anna, 'anna says hi', 200);
    await expect(wsBen.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);

    const annaHistory = await ctx.http().get(`/venues/${square.id}/messages`).set(auth(anna)).expect(200);
    expect(annaHistory.body.messages.map((m: { id: string }) => m.id)).not.toContain(fromBen.body.message.id);
    const benHistory = await ctx.http().get(`/venues/${square.id}/messages`).set(auth(ben)).expect(200);
    expect(benHistory.body.messages.map((m: { id: string }) => m.id)).not.toContain(fromAnna.body.message.id);

    await ctx.http().delete(`/users/${ben.id}/block`).set(auth(anna)).expect(204);
    const afterUnblock = await ctx.http().get(`/venues/${square.id}/messages`).set(auth(anna)).expect(200);
    expect(afterUnblock.body.messages.map((m: { id: string }) => m.id)).toContain(fromBen.body.message.id);

    const self = await ctx.http().post(`/users/${anna.id}/block`).set(auth(anna)).expect(400);
    expect(self.body.code).toBe('CANNOT_BLOCK_SELF');
    await wsAnna.close();
    await wsBen.close();
  });

  it('fills gaps after a message id', async () => {
    const first = await sendExpect(ben, 'first', 200);
    const second = await sendExpect(ben, 'second', 200);
    const res = await ctx.http().get(`/venues/${square.id}/messages`).query({ afterId: first.body.message.id }).set(auth(ben)).expect(200);
    const ids = res.body.messages.map((m: { id: string }) => m.id);
    expect(ids).toContain(second.body.message.id);
    expect(ids).not.toContain(first.body.message.id);
  });

  it('suspends after the strike threshold, ends the membership and closes the socket', async () => {
    const repeat = await registerUser(ctx);
    await verifyAge(ctx, repeat);
    await joinSquare(repeat);
    const ws = await connectWs(ctx, repeat);
    const closed = new Promise<number>((resolve) => ws.socket.once('close', (code) => resolve(code)));

    for (let i = 0; i < 3; i++) {
      // Three severe violations reach the suspension threshold (3 + 3 + 3 = 9).
      await unmute(repeat);
      await sendExpect(repeat, `[block3] ${i}`, 200);
    }
    expect(await closed).toBe(4403);
    const me = await ctx.http().get('/me').set(auth(repeat)).expect(200);
    expect(me.body.suspendedAt).not.toBeNull();
    expect(me.body.activeMembership).toBeNull();
    const denied = await sendExpect(repeat, 'hello', 403);
    expect(denied.body.code).toBe('SUSPENDED');
    expect(await ctx.prisma.incident.count({ where: { userId: repeat.id, kind: 'STRIKE_THRESHOLD' } })).toBe(1);
  });
});
