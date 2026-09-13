import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessagesService } from '../src/messages/messages.service.js';
import { RetentionService } from '../src/retention/retention.service.js';
import { auth, binary, connectWs, createTestApp, makeJpeg, registerUser, type TestContext, type TestUser, uploadImage, verifyAge } from './helpers.js';

describe('photo uploads and image messages', () => {
  let ctx: TestContext;
  let anna: TestUser;
  let ben: TestUser;
  let venue: { id: string; lat: number; lng: number };

  const join = (u: TestUser) =>
    ctx.http().post(`/venues/${venue.id}/join`).set(auth(u)).send({ lat: venue.lat, lng: venue.lng, accuracy: 10 }).expect(201);
  const sendImage = (u: TestUser, body: Record<string, unknown>) =>
    ctx.http().post(`/venues/${venue.id}/messages`).set(auth(u)).send({ kind: 'IMAGE', clientKey: randomUUID(), ...body });
  const fetchMedia = (path: string) => ctx.http().get(path).buffer(true).parse(binary);
  const urlPath = (url: string) => new URL(url).pathname;

  beforeAll(async () => {
    ctx = await createTestApp();
    venue = await ctx.prisma.venue.create({ data: { slug: `media-${randomUUID().slice(0, 8)}`, name: 'Photo Square', lat: 48.14, lng: 11.57 } });
    anna = await registerUser(ctx, { displayName: `anna_${randomUUID().slice(0, 6)}` });
    ben = await registerUser(ctx, { displayName: `ben_${randomUUID().slice(0, 6)}` });
    await verifyAge(ctx, anna);
    await verifyAge(ctx, ben);
    await join(anna);
    await join(ben);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('re-encodes uploads upright, strips metadata and serves them with long caching', async () => {
    const view = await uploadImage(ctx, anna, await makeJpeg({ width: 800, height: 600, orientation: 6 }));
    expect(view.id).toMatch(/^[a-f0-9]{32}$/);
    expect([view.width, view.height]).toEqual([600, 800]);
    expect(view.url).toContain(`/media/${view.id}.jpg`);
    expect(view.thumbUrl).toContain(`/media/${view.id}_thumb.jpg`);
    const row = await ctx.prisma.media.findUniqueOrThrow({ where: { id: view.id } });
    expect(row.status).toBe('UPLOADED');
    expect(row.ownerId).toBe(anna.id);

    const served = await fetchMedia(urlPath(view.url)).expect(200);
    expect(served.headers['content-type']).toContain('image/jpeg');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.headers['x-robots-tag']).toBe('noindex');
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([600, 800]);
    const thumb = await sharp(((await fetchMedia(urlPath(view.thumbUrl)).expect(200)).body as Buffer)).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(400);
  });

  it('rejects non-images, fakes, oversized files and empty requests', async () => {
    const text = await ctx.http().post('/uploads').set(auth(anna)).attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(text.status).toBe(415);
    expect(text.body.code).toBe('UNSUPPORTED_MEDIA');

    const fake = await ctx.http().post('/uploads').set(auth(anna)).attach('file', Buffer.from('not really a png'), { filename: 'a.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    expect(fake.body.code).toBe('UNSUPPORTED_MEDIA');

    const huge = await ctx.http().post('/uploads').set(auth(anna)).attach('file', Buffer.alloc(2_500_000, 1), { filename: 'big.jpg', contentType: 'image/jpeg' });
    expect(huge.status).toBe(413);
    expect(huge.body.code).toBe('PAYLOAD_TOO_LARGE');

    const empty = await ctx.http().post('/uploads').set(auth(anna)).expect(400);
    expect(empty.body.code).toBe('VALIDATION');

    const png = await uploadImage(ctx, anna, await makeJpeg({ format: 'png' }), { filename: 'p.png', contentType: 'image/png' });
    expect(png.url).toMatch(/\.jpg$/);
  });

  it('sends a photo message to the room, records it in history and marks the upload attached', async () => {
    const wsBen = await connectWs(ctx, ben);
    expect((await wsBen.request<{ type: string; ok: boolean }>({ type: 'join', venueId: venue.id })).ok).toBe(true);

    const view = await uploadImage(ctx, anna);
    const res = await sendImage(anna, { mediaId: view.id, text: 'lunch spot' }).expect(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.message).toMatchObject({ kind: 'IMAGE', text: 'lunch spot', caption: 'lunch spot', image: { url: view.url, thumbUrl: view.thumbUrl, width: view.width, height: view.height } });

    type MessageEvent = { type: string; message: { id: string; kind: string; image?: { url: string } } };
    const delivered = await wsBen.waitFor<MessageEvent>((e) => e.type === 'message' && e.message.id === res.body.message.id);
    expect(delivered.message).toMatchObject({ kind: 'IMAGE', image: { url: view.url } });

    const history = await ctx.http().get(`/venues/${venue.id}/messages`).set(auth(ben)).expect(200);
    const mine = history.body.messages.find((m: { id: string }) => m.id === res.body.message.id);
    expect(mine).toMatchObject({ kind: 'IMAGE', caption: 'lunch spot', image: { url: view.url } });

    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('ATTACHED');
    const reuse = await sendImage(anna, { mediaId: view.id, text: 'again' }).expect(409);
    expect(reuse.body.code).toBe('MEDIA_ALREADY_USED');

    const foreign = await sendImage(ben, { mediaId: (await uploadImage(ctx, anna)).id }).expect(404);
    expect(foreign.body.code).toBe('NOT_FOUND');
    await sendImage(anna, {}).expect(400);
    await sendImage(anna, { mediaId: (await uploadImage(ctx, anna)).id, text: 'x'.repeat(201) }).expect(400);

    // Without a caption, old clients still get something readable.
    const plain = await sendImage(anna, { mediaId: (await uploadImage(ctx, anna)).id }).expect(200);
    expect(plain.body.message).toMatchObject({ kind: 'IMAGE', text: '[Photo]', caption: '' });
    wsBen.close();
  });

  it('blocks a photo the classifier rejects and deletes its files at once', async () => {
    const view = await uploadImage(ctx, anna);
    const res = await sendImage(anna, { mediaId: view.id, text: '[image-block]' }).expect(200);
    expect(res.body).toEqual({ status: 'blocked', notice: "This photo doesn't meet our community guidelines." });
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('REJECTED');
    await fetchMedia(urlPath(view.url)).expect(404);
    const violation = await ctx.prisma.violation.findFirst({ where: { userId: anna.id }, orderBy: { createdAt: 'desc' } });
    expect(violation?.severity).toBe(2);
    const stored = await ctx.prisma.message.findFirst({ where: { mediaId: view.id } });
    expect(stored?.status).toBe('BLOCKED');
  });

  it('fails closed when the classifier is unavailable and keeps the upload for a retry', async () => {
    const view = await uploadImage(ctx, anna);
    const res = await sendImage(anna, { mediaId: view.id, text: '[image-unavailable]' }).expect(503);
    expect(res.body.code).toBe('MODERATION_UNAVAILABLE');
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('UPLOADED');
    await fetchMedia(urlPath(view.url)).expect(200);
    const retry = await sendImage(anna, { mediaId: view.id, text: 'second try' }).expect(200);
    expect(retry.body.status).toBe('approved');
  });

  it('quarantines the files when the message is hidden', async () => {
    const view = await uploadImage(ctx, anna);
    const res = await sendImage(anna, { mediaId: view.id }).expect(200);
    expect(await ctx.app.get(MessagesService).hide(res.body.message.id)).toBe(true);
    await fetchMedia(urlPath(view.url)).expect(404);
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: view.id } })).status).toBe('QUARANTINED');
  });

  it('purges orphaned uploads and the files of expired messages', async () => {
    const orphan = await uploadImage(ctx, anna);
    const fresh = await uploadImage(ctx, anna);
    const attached = await uploadImage(ctx, anna);
    const sent = await sendImage(anna, { mediaId: attached.id }).expect(200);
    await ctx.prisma.media.update({ where: { id: orphan.id }, data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    await ctx.prisma.message.update({ where: { id: sent.body.message.id }, data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } });

    const result = await ctx.app.get(RetentionService).run();
    expect(result.media).toBeGreaterThanOrEqual(2);
    expect(await ctx.prisma.media.findUnique({ where: { id: orphan.id } })).toBeNull();
    expect(await ctx.prisma.media.findUnique({ where: { id: attached.id } })).toBeNull();
    expect(await ctx.prisma.message.findUnique({ where: { id: sent.body.message.id } })).toBeNull();
    await fetchMedia(urlPath(orphan.url)).expect(404);
    await fetchMedia(urlPath(attached.url)).expect(404);
    expect((await ctx.prisma.media.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('UPLOADED');
    await fetchMedia(urlPath(fresh.url)).expect(200);
  });
});
