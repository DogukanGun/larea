import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RetentionService } from '../src/retention/retention.service.js';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

describe('reports, moderator actions and retention', () => {
  let ctx: TestContext;
  let square: { id: string; lat: number; lng: number };
  let author: TestUser;
  let reporters: TestUser[];
  let moderator: TestUser;

  const join = (u: TestUser) =>
    ctx.http().post(`/venues/${square.id}/join`).set(auth(u)).send({ lat: square.lat, lng: square.lng, accuracy: 10 }).expect(201);
  const send = async (u: TestUser, text: string) => {
    const res = await ctx.http().post(`/venues/${square.id}/messages`).set(auth(u)).send({ text, clientKey: randomUUID() });
    if (res.status !== 200) throw new Error(`send failed ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.message as { id: string };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.prisma.venue.upsert({ where: { slug: 'main-square' }, update: {}, create: { slug: 'main-square', name: 'Main Square', lat: 52.5219, lng: 13.4132 } });
    square = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'main-square' } });
    author = await registerUser(ctx);
    reporters = [await registerUser(ctx), await registerUser(ctx), await registerUser(ctx)];
    moderator = await registerUser(ctx);
    for (const u of [author, ...reporters, moderator]) {
      await verifyAge(ctx, u);
      await join(u);
    }
    await ctx.prisma.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } });
    await ctx.redis.client.del(`user:snap:${moderator.id}`);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('accepts reports idempotently and hides a message after three distinct reporters', async () => {
    const watcher = await connectWs(ctx, reporters[0]);
    await watcher.request({ type: 'join', venueId: square.id });
    const message = await send(author, 'this will be reported');

    const self = await ctx.http().post(`/messages/${message.id}/reports`).set(auth(author)).send({ reason: 'SPAM' }).expect(400);
    expect(self.body.code).toBe('CANNOT_REPORT_SELF');
    const badReason = await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[0])).send({ reason: 'NOPE' }).expect(400);
    expect(badReason.body.code).toBe('VALIDATION');

    const first = await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[0])).send({ reason: 'HARASSMENT', details: 'rude' }).expect(200);
    const again = await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[0])).send({ reason: 'HARASSMENT' }).expect(200);
    expect(again.body.reportId).toBe(first.body.reportId);
    await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[1])).send({ reason: 'THREAT' }).expect(200);
    expect((await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe('APPROVED');

    await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[2])).send({ reason: 'HATE' }).expect(200);
    expect((await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe('HIDDEN');
    const hidden = await watcher.waitFor<{ type: 'message_hidden'; messageId: string }>((e) => e.type === 'message_hidden');
    expect(hidden.messageId).toBe(message.id);
    expect(await ctx.prisma.incident.count({ where: { userId: author.id, kind: 'REPORT_THRESHOLD', refId: message.id, status: 'OPEN' } })).toBe(1);

    const history = await ctx.http().get(`/venues/${square.id}/messages`).set(auth(reporters[1])).expect(200);
    expect(history.body.messages.map((m: { id: string }) => m.id)).not.toContain(message.id);
    await watcher.close();
  });

  it('exposes the queue to moderators only and applies a mute on resolve', async () => {
    const message = await send(author, 'second reported message');
    await ctx.http().post(`/messages/${message.id}/reports`).set(auth(reporters[0])).send({ reason: 'SCAM' }).expect(200);

    const denied = await ctx.http().get('/admin/reports').set(auth(reporters[0])).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');

    const queue = await ctx.http().get('/admin/reports').set(auth(moderator)).expect(200);
    const entry = queue.body.find((r: { message: { id: string } }) => r.message.id === message.id);
    expect(entry).toMatchObject({ status: 'OPEN', reason: 'SCAM', reportedUser: { id: author.id } });

    const full = await ctx.http().get(`/admin/messages/${message.id}`).set(auth(moderator)).expect(200);
    expect(full.body.reports).toHaveLength(1);
    expect(full.body.author.id).toBe(author.id);

    const resolved = await ctx.http().post(`/admin/reports/${entry.id}/resolve`).set(auth(moderator)).send({ action: 'MUTE', durationHours: 2, note: 'spam' }).expect(201);
    expect(resolved.body.status).toBe('ACTIONED');
    expect((await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe('HIDDEN');
    const me = await ctx.http().get('/me').set(auth(author)).expect(200);
    expect(new Date(me.body.mutedUntil).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
    expect(await ctx.prisma.violation.count({ where: { userId: author.id, source: 'MODERATOR', severity: 2 } })).toBe(1);

    // The report-threshold incident from the first test is still open; a moderator closes it explicitly.
    // The test database accumulates incidents across runs; look past the default page size.
    const open = await ctx.http().get('/admin/incidents').query({ limit: 200 }).set(auth(moderator)).expect(200);
    const incident = open.body.find((i: { userId: string; kind: string }) => i.userId === author.id && i.kind === 'REPORT_THRESHOLD');
    expect(incident).toBeDefined();
    await ctx.http().post(`/admin/incidents/${incident.id}/resolve`).set(auth(moderator)).expect(201);
    const resolvedIncidents = await ctx.http().get('/admin/incidents').query({ status: 'RESOLVED', limit: 200 }).set(auth(moderator)).expect(200);
    expect(resolvedIncidents.body.map((i: { id: string }) => i.id)).toContain(incident.id);
    await ctx.http().post(`/admin/incidents/${incident.id}/resolve`).set(auth(moderator)).expect(404);
  });

  it('suspends and unsuspends users through the admin API', async () => {
    const target = await registerUser(ctx);
    await verifyAge(ctx, target);
    await join(target);
    await ctx.http().post(`/admin/users/${target.id}/suspend`).set(auth(moderator)).send({ reason: 'manual review' }).expect(201);
    const me = await ctx.http().get('/me').set(auth(target)).expect(200);
    expect(me.body.suspendedAt).not.toBeNull();
    expect(me.body.activeMembership).toBeNull();
    const blocked = await ctx.http().get('/venues/nearby').query({ lat: square.lat, lng: square.lng, accuracy: 10 }).set(auth(target)).expect(403);
    expect(blocked.body.code).toBe('SUSPENDED');

    await ctx.http().post(`/admin/users/${target.id}/unsuspend`).set(auth(moderator)).expect(201);
    expect((await ctx.http().get('/me').set(auth(target)).expect(200)).body.suspendedAt).toBeNull();
  });

  it('purges old chat but keeps flagged messages for the moderation record window', async () => {
    const retention = ctx.app.get(RetentionService);
    await ctx.prisma.user.update({ where: { id: author.id }, data: { mutedUntil: null } });
    await ctx.redis.client.del(`user:snap:${author.id}`);
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const ancient = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const plain = await send(author, 'old and boring');
    const reported = await send(author, 'old but reported');
    const ancientReported = await send(author, 'ancient and reported');
    await ctx.http().post(`/messages/${reported.id}/reports`).set(auth(reporters[0])).send({ reason: 'OTHER' }).expect(200);
    await ctx.http().post(`/messages/${ancientReported.id}/reports`).set(auth(reporters[0])).send({ reason: 'OTHER' }).expect(200);
    await ctx.prisma.message.update({ where: { id: plain.id }, data: { createdAt: old } });
    await ctx.prisma.message.update({ where: { id: reported.id }, data: { createdAt: old } });
    await ctx.prisma.message.update({ where: { id: ancientReported.id }, data: { createdAt: ancient } });
    const fresh = await send(author, 'fresh');

    const result = await retention.run();
    expect(result.messages).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.message.findUnique({ where: { id: plain.id } })).toBeNull();
    expect(await ctx.prisma.message.findUnique({ where: { id: reported.id } })).not.toBeNull();
    expect(await ctx.prisma.message.findUnique({ where: { id: ancientReported.id } })).toBeNull();
    expect(await ctx.prisma.message.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });
});
