import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, uploadImage, verifyAge } from './helpers.js';

interface Ack {
  type: 'ack';
  ok: boolean;
}
interface Quote {
  id: string;
  unavailable?: true;
  author?: { id: string; displayName: string };
  kind?: string;
  text?: string;
}
interface MessageEvent {
  type: 'message';
  message: { id: string; replyTo?: Quote };
}

describe('replies', () => {
  let ctx: TestContext;
  let anna: TestUser;
  let ben: TestUser;
  let cara: TestUser;
  let library: { id: string; lat: number; lng: number };
  let station: { id: string; lat: number; lng: number };

  const join = (u: TestUser, v: { id: string; lat: number; lng: number }) =>
    ctx.http().post(`/venues/${v.id}/join`).set(auth(u)).send({ lat: v.lat, lng: v.lng, accuracy: 10 }).expect(201);
  const send = (u: TestUser, body: Record<string, unknown>, venueId = library.id) =>
    ctx.http().post(`/venues/${venueId}/messages`).set(auth(u)).send({ clientKey: randomUUID(), ...body });
  const history = async (u: TestUser) =>
    (await ctx.http().get(`/venues/${library.id}/messages`).set(auth(u)).expect(200)).body.messages as { id: string; replyTo?: Quote }[];
  const quoteIn = async (u: TestUser, id: string) => (await history(u)).find((m) => m.id === id)?.replyTo;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.prisma.venue.upsert({ where: { slug: 'reply-library' }, update: {}, create: { slug: 'reply-library', name: 'Reply Library', lat: 52.5101, lng: 13.3901 } });
    await ctx.prisma.venue.upsert({ where: { slug: 'reply-station' }, update: {}, create: { slug: 'reply-station', name: 'Reply Station', lat: 52.5102, lng: 13.3903 } });
    library = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'reply-library' } });
    station = await ctx.prisma.venue.findUniqueOrThrow({ where: { slug: 'reply-station' } });
    await ctx.prisma.message.deleteMany({ where: { venueId: { in: [library.id, station.id] } } });
    anna = await registerUser(ctx, { displayName: `anna_${randomUUID().slice(0, 6)}` });
    ben = await registerUser(ctx, { displayName: `ben_${randomUUID().slice(0, 6)}` });
    cara = await registerUser(ctx, { displayName: `cara_${randomUUID().slice(0, 6)}` });
    for (const u of [anna, ben, cara]) {
      await verifyAge(ctx, u);
      await join(u, library);
    }
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('delivers a reply with a quote of the answered message, live and in history', async () => {
    const wsBen = await connectWs(ctx, ben);
    expect((await wsBen.request<Ack>({ type: 'join', venueId: library.id })).ok).toBe(true);

    const parent = await send(anna, { text: 'found a quiet corner on the 3rd floor' }).expect(200);
    await wsBen.waitFor((e) => e.type === 'message');
    const key = randomUUID();
    const reply = await send(ben, { text: 'which side?', replyToId: parent.body.message.id, clientKey: key }).expect(200);
    const quote = { id: parent.body.message.id, author: { id: anna.id, displayName: anna.displayName }, kind: 'TEXT', text: 'found a quiet corner on the 3rd floor' };
    expect(reply.body.message.replyTo).toEqual(quote);

    const live = await wsBen.waitFor<MessageEvent>((e) => e.type === 'message');
    expect(live.message.replyTo).toEqual(quote);
    expect(await quoteIn(cara, reply.body.message.id)).toEqual(quote);

    // Resending with the same key returns the same reply and delivers nothing new.
    const again = await send(ben, { text: 'which side?', replyToId: parent.body.message.id, clientKey: key }).expect(200);
    expect(again.body.message.id).toBe(reply.body.message.id);
    await expect(wsBen.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);
    await wsBen.close();
  });

  it('quotes photos, polls and masked text, and shortens long messages', async () => {
    const photo = await send(anna, { kind: 'IMAGE', mediaId: (await uploadImage(ctx, anna)).id }).expect(200);
    const toPhoto = await send(ben, { text: 'nice spot', replyToId: photo.body.message.id }).expect(200);
    expect(toPhoto.body.message.replyTo).toMatchObject({ kind: 'IMAGE', text: '[Photo]' });

    const poll = await ctx.http().post(`/venues/${library.id}/polls`).set(auth(anna)).send({ question: 'Coffee at 4?', options: ['Yes', 'Later'], clientKey: randomUUID() }).expect(200);
    const toPoll = await send(ben, { text: 'yes please', replyToId: poll.body.message.id }).expect(200);
    expect(toPoll.body.message.replyTo).toMatchObject({ kind: 'POLL', text: 'Poll: Coffee at 4?' });

    const censored = await send(cara, { text: 'this damn printer' }).expect(200);
    const toCensored = await send(ben, { text: 'same here', replyToId: censored.body.message.id }).expect(200);
    expect(toCensored.body.message.replyTo.text).toBe('this d*** printer');

    const long = await send(anna, { text: 'a'.repeat(300) }).expect(200);
    const toLong = await send(ben, { text: 'tl;dr?', replyToId: long.body.message.id }).expect(200);
    expect(toLong.body.message.replyTo.text).toHaveLength(140);
    expect(toLong.body.message.replyTo.text.endsWith('…')).toBe(true);

    const photoReply = await send(anna, { kind: 'IMAGE', mediaId: (await uploadImage(ctx, anna)).id, replyToId: toPhoto.body.message.id }).expect(200);
    expect(photoReply.body.message).toMatchObject({ kind: 'IMAGE', replyTo: { id: toPhoto.body.message.id, text: 'nice spot' } });
  });

  it('only answers visible messages in the same place and room', async () => {
    await join(anna, station);
    const elsewhere = await send(anna, { text: 'at the station' }, station.id).expect(200);
    await join(anna, library);
    expect((await send(anna, { text: 'hm', replyToId: elsewhere.body.message.id }).expect(404)).body.code).toBe('NOT_FOUND');

    const regulars = await ctx.prisma.message.create({
      data: { venueId: library.id, authorId: cara.id, text: 'regulars only', status: 'APPROVED', room: 'REGULARS', clientKey: randomUUID() },
    });
    await send(anna, { text: 'hm', replyToId: regulars.id }).expect(404);

    const tip = await ctx.prisma.message.create({ data: { venueId: library.id, authorId: cara.id, kind: 'TIP', text: 'cara tipped anna 2 USDC', status: 'APPROVED', clientKey: randomUUID() } });
    await send(anna, { text: 'thanks', replyToId: tip.id }).expect(404);

    const hidden = await send(cara, { text: 'soon gone' }).expect(200);
    await ctx.prisma.message.update({ where: { id: hidden.body.message.id }, data: { status: 'HIDDEN' } });
    await send(anna, { text: 'hm', replyToId: hidden.body.message.id }).expect(404);

    await send(anna, { text: 'hm', replyToId: randomUUID() }).expect(404);
    expect((await send(anna, { text: 'hm', replyToId: 'not-an-id' }).expect(400)).body.code).toBe('VALIDATION');
  });

  it('shows the quote as unavailable once the answered message is hidden, and drops it when deleted', async () => {
    const parent = await send(cara, { text: 'about to be reported' }).expect(200);
    const reply = await send(ben, { text: 'what?', replyToId: parent.body.message.id }).expect(200);
    await ctx.prisma.message.update({ where: { id: parent.body.message.id }, data: { status: 'HIDDEN' } });
    expect(await quoteIn(anna, reply.body.message.id)).toEqual({ id: parent.body.message.id, unavailable: true });

    await ctx.prisma.message.delete({ where: { id: parent.body.message.id } });
    expect(await quoteIn(anna, reply.body.message.id)).toBeUndefined();
  });

  it('keeps quotes of blocked people out of sight, live and in history, and refuses replies to them', async () => {
    await ctx.http().post(`/users/${cara.id}/block`).set(auth(anna)).expect(204);
    const wsAnna = await connectWs(ctx, anna);
    const wsBen = await connectWs(ctx, ben);
    await wsAnna.request<Ack>({ type: 'join', venueId: library.id });
    await wsBen.request<Ack>({ type: 'join', venueId: library.id });

    const parent = await send(cara, { text: 'cara was here' }).expect(200);
    await wsBen.waitFor((e) => e.type === 'message');
    const reply = await send(ben, { text: 'hi cara', replyToId: parent.body.message.id }).expect(200);

    const annaSees = await wsAnna.waitFor<MessageEvent>((e) => e.type === 'message');
    expect(annaSees.message).toMatchObject({ id: reply.body.message.id, replyTo: { id: parent.body.message.id, unavailable: true } });
    const benSees = await wsBen.waitFor<MessageEvent>((e) => e.type === 'message');
    expect(benSees.message.replyTo).toMatchObject({ text: 'cara was here' });
    await expect(wsAnna.waitFor((e) => e.type === 'message', 300)).rejects.toThrow(/timed out/);

    expect(await quoteIn(anna, reply.body.message.id)).toEqual({ id: parent.body.message.id, unavailable: true });
    expect(await quoteIn(ben, reply.body.message.id)).toMatchObject({ text: 'cara was here' });
    await send(anna, { text: 'no', replyToId: parent.body.message.id }).expect(404);

    await ctx.http().delete(`/users/${cara.id}/block`).set(auth(anna)).expect(204);
    expect(await quoteIn(anna, reply.body.message.id)).toMatchObject({ text: 'cara was here' });
    await wsAnna.close();
    await wsBen.close();
  });
});
