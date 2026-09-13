import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

interface PollView {
  id: string;
  question: string;
  options: { id: string; text: string; votes: number }[];
  totalVotes: number;
  closed: boolean;
  closesAt: string | null;
  myOptionId?: string | null;
}
interface PollUpdate {
  type: string;
  messageId: string;
  poll: PollView;
}

describe('polls', () => {
  let ctx: TestContext;
  let anna: TestUser;
  let ben: TestUser;
  let carl: TestUser;
  let venue: { id: string; lat: number; lng: number };

  const join = (u: TestUser) =>
    ctx.http().post(`/venues/${venue.id}/join`).set(auth(u)).send({ lat: venue.lat, lng: venue.lng, accuracy: 10 }).expect(201);
  const create = (u: TestUser, body: Record<string, unknown>) =>
    ctx.http().post(`/venues/${venue.id}/polls`).set(auth(u)).send({ question: 'Pizza or ramen?', options: ['Pizza', 'Ramen'], clientKey: randomUUID(), ...body });
  const vote = (u: TestUser, pollId: string, optionId: string) => ctx.http().post(`/polls/${pollId}/vote`).set(auth(u)).send({ optionId });
  const closeAllOpen = (u: TestUser) => ctx.prisma.poll.updateMany({ where: { authorId: u.id, closed: false }, data: { closed: true } });

  beforeAll(async () => {
    ctx = await createTestApp();
    venue = await ctx.prisma.venue.create({ data: { slug: `polls-${randomUUID().slice(0, 8)}`, name: 'Poll Square', lat: 48.13, lng: 11.56 } });
    anna = await registerUser(ctx, { displayName: `anna_${randomUUID().slice(0, 6)}` });
    ben = await registerUser(ctx, { displayName: `ben_${randomUUID().slice(0, 6)}` });
    carl = await registerUser(ctx, { displayName: `carl_${randomUUID().slice(0, 6)}` });
    for (const u of [anna, ben, carl]) await verifyAge(ctx, u);
    await join(anna);
    await join(ben);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('starts a poll as a message everyone in the room receives and history keeps', async () => {
    const wsBen = await connectWs(ctx, ben);
    expect((await wsBen.request<{ type: string; ok: boolean }>({ type: 'join', venueId: venue.id })).ok).toBe(true);

    const key = randomUUID();
    const res = await create(anna, { clientKey: key, durationMinutes: 60 }).expect(200);
    expect(res.body.status).toBe('approved');
    const message = res.body.message;
    expect(message).toMatchObject({ kind: 'POLL', text: 'Poll: Pizza or ramen?' });
    expect(message.poll).toMatchObject({ question: 'Pizza or ramen?', totalVotes: 0, closed: false, myOptionId: null });
    expect(message.poll.options.map((o: { text: string }) => o.text)).toEqual(['Pizza', 'Ramen']);
    expect(message.poll.closesAt).not.toBeNull();

    const delivered = await wsBen.waitFor<{ type: string; message: { id: string; poll?: PollView } }>((e) => e.type === 'message' && e.message.id === message.id);
    expect(delivered.message.poll?.question).toBe('Pizza or ramen?');
    expect(delivered.message.poll).not.toHaveProperty('myOptionId');

    const again = await create(anna, { clientKey: key }).expect(200);
    expect(again.body.message.id).toBe(message.id);

    const history = await ctx.http().get(`/venues/${venue.id}/messages`).set(auth(ben)).expect(200);
    const fromHistory = history.body.messages.find((m: { id: string }) => m.id === message.id);
    expect(fromHistory.poll).toMatchObject({ id: message.poll.id, myOptionId: null });
    wsBen.close();
  });

  it('validates the shape of a poll', async () => {
    await create(anna, { options: ['Only one'] }).expect(400);
    await create(anna, { options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).expect(400);
    await create(anna, { options: ['Pizza', 'x'.repeat(61)] }).expect(400);
    await create(anna, { question: 'q'.repeat(201) }).expect(400);
    await create(anna, { options: ['Same', 'same'] }).expect(400);
    await create(anna, { durationMinutes: 1 }).expect(400);
  });

  it('counts one vote per member, lets it move, and fans the counts out', async () => {
    const wsAnna = await connectWs(ctx, anna);
    expect((await wsAnna.request<{ type: string; ok: boolean }>({ type: 'join', venueId: venue.id })).ok).toBe(true);
    const created = await create(anna, {}).expect(200);
    const poll: PollView = created.body.message.poll;
    const [pizza, ramen] = poll.options;

    const first = await vote(ben, poll.id, pizza.id).expect(200);
    expect(first.body.poll).toMatchObject({ totalVotes: 1, myOptionId: pizza.id });
    expect(first.body.poll.options.map((o: { votes: number }) => o.votes)).toEqual([1, 0]);
    const update = await wsAnna.waitFor<PollUpdate>((e) => e.type === 'poll_update' && e.poll.id === poll.id && e.poll.totalVotes === 1);
    expect(update.messageId).toBe(created.body.message.id);
    expect(update.poll).not.toHaveProperty('myOptionId');

    const moved = await vote(ben, poll.id, ramen.id).expect(200);
    expect(moved.body.poll.options.map((o: { votes: number }) => o.votes)).toEqual([0, 1]);
    expect(moved.body.poll.totalVotes).toBe(1);

    const bad = await vote(ben, poll.id, randomUUID()).expect(400);
    expect(bad.body.code).toBe('INVALID_OPTION');
    const outsider = await vote(carl, poll.id, pizza.id).expect(403);
    expect(outsider.body.code).toBe('NOT_MEMBER');
    wsAnna.close();
  });

  it('only the author (or a moderator) can close it, and closed polls take no votes', async () => {
    await closeAllOpen(anna);
    const created = await create(anna, {}).expect(200);
    const poll: PollView = created.body.message.poll;
    await ctx.http().post(`/polls/${poll.id}/close`).set(auth(ben)).expect(403);
    const closed = await ctx.http().post(`/polls/${poll.id}/close`).set(auth(anna)).expect(200);
    expect(closed.body.poll.closed).toBe(true);
    const late = await vote(ben, poll.id, poll.options[0].id).expect(409);
    expect(late.body.code).toBe('POLL_CLOSED');
    await ctx.http().post(`/polls/${poll.id}/close`).set(auth(anna)).expect(409);

    const timed = await create(anna, { durationMinutes: 5 }).expect(200);
    await ctx.prisma.poll.update({ where: { id: timed.body.message.poll.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    const expired = await vote(ben, timed.body.message.poll.id, timed.body.message.poll.options[0].id).expect(409);
    expect(expired.body.code).toBe('POLL_CLOSED');
  });

  it('caps open polls per member and moderates the text as one piece', async () => {
    await closeAllOpen(anna); // closed and expired polls do not count towards the cap
    const a = await create(anna, { question: 'Open one?' }).expect(200);
    expect(a.body.status).toBe('approved');
    const b = await create(anna, { question: 'Open two?' }).expect(200);
    expect(b.body.status).toBe('approved');
    const third = await create(anna, { question: 'Open three?' }).expect(409);
    expect(third.body.code).toBe('TOO_MANY_POLLS');

    const blocked = await create(ben, { question: 'Who should we corner? [block3]' }).expect(200);
    expect(blocked.body).toEqual({ status: 'blocked', notice: "Polls can't contain that language. Please rephrase it." });
    expect(await ctx.prisma.poll.count({ where: { authorId: ben.id } })).toBe(0);
    const violation = await ctx.prisma.violation.findFirst({ where: { userId: ben.id }, orderBy: { createdAt: 'desc' } });
    expect(violation?.severity).toBe(3);
    await ctx.prisma.user.update({ where: { id: ben.id }, data: { mutedUntil: null } });
    await ctx.redis.client.del(`user:snap:${ben.id}`);

    const down = await create(ben, { question: 'Anything? [unavailable]' }).expect(503);
    expect(down.body.code).toBe('MODERATION_UNAVAILABLE');
  });
});
