import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siwsMessage } from '../src/solana/siws.js';
import { SOLANA_CLIENT } from '../src/solana/solana.client.js';
import { TipsService } from '../src/solana/tips.service.js';
import type { FakeSolanaClient } from '../src/testing/fake-solana.client.js';
import { auth, connectWs, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

interface MessageEvent {
  type: 'message';
  message: { id: string; kind: string; text: string; tip?: { amount: string; token: string; to: { id: string } } };
}

describe('tips in the chat', () => {
  let ctx: TestContext;
  let fake: FakeSolanaClient;
  let venue: { id: string; lat: number; lng: number };
  let fix: { lat: number; lng: number; accuracy: number };

  beforeAll(async () => {
    ctx = await createTestApp();
    fake = ctx.app.get(SOLANA_CLIENT);
    venue = await ctx.prisma.venue.create({ data: { slug: `tips-${randomUUID().slice(0, 8)}`, name: 'Tip Jar', lat: -60 - Math.random() * 5, lng: -150 + Math.random() * 60 } });
    fix = { lat: venue.lat, lng: venue.lng, accuracy: 10 };
  });

  afterAll(async () => {
    await ctx?.prisma.venue.deleteMany({ where: { id: venue?.id } });
    await ctx?.close();
  });

  async function present(withWallet = true): Promise<TestUser & { address?: string }> {
    const user = await registerUser(ctx);
    await verifyAge(ctx, user);
    await ctx.http().post(`/venues/${venue.id}/join`).set(auth(user)).send(fix).expect(201);
    if (!withWallet) return user;
    const keys = nacl.sign.keyPair();
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(user)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    const signature = Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64');
    await ctx.http().post('/solana/wallet').set(auth(user)).send({ address, message: Buffer.from(message).toString('base64'), signature }).expect(201);
    return { ...user, address };
  }

  it('tips someone in USDC and announces it in the chat', async () => {
    const anna = await present();
    const ben = await present();
    const watcher = await present(false);
    const ws = await connectWs(ctx, watcher);
    await ws.request({ type: 'join', venueId: venue.id });

    const res = await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: ben.id, token: 'USDC', amount: '2.5' }).expect(201);
    expect(res.body.tip).toMatchObject({ status: 'PENDING', amount: '2.5', token: 'USDC', to: { id: ben.id } });
    expect(fake.transfers.at(-1)).toMatchObject({ from: anna.address, to: ben.address, token: 'USDC', amount: '2500000', memo: `larea:tip:${res.body.tip.id}` });

    const done = await ctx.http().post(`/solana/tips/${res.body.tip.id}/submit`).set(auth(anna)).send({ signedTransaction: fake.sign(res.body.transaction) }).expect(201);
    expect(done.body.status).toBe('CONFIRMED');
    expect(done.body.messageId).toBeTruthy();

    const event = await ws.waitFor<MessageEvent>((e) => e.type === 'message' && e.message.kind === 'TIP');
    expect(event.message.text).toBe(`${anna.displayName} tipped ${ben.displayName} 2.5 USDC`);
    expect(event.message.tip).toMatchObject({ amount: '2.5', token: 'USDC', to: { id: ben.id } });
    await ws.close();

    // Reporting it again changes nothing.
    const again = await ctx.http().post(`/solana/tips/${res.body.tip.id}/submit`).set(auth(anna)).send({ signedTransaction: fake.sign(res.body.transaction) }).expect(201);
    expect(again.body.messageId).toBe(done.body.messageId);
    const history = await ctx.http().get(`/venues/${venue.id}/messages`).set(auth(ben)).expect(200);
    expect(history.body.messages.filter((m: { kind: string }) => m.kind === 'TIP')).toHaveLength(1);
  });

  it('refuses tips without wallets, to yourself, outside the limits, and for strangers', async () => {
    const anna = await present();
    const noWallet = await present(false);
    const res = await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: noWallet.id, token: 'SKR', amount: '1' }).expect(409);
    expect(res.body.code).toBe('RECIPIENT_NO_WALLET');
    const fromNoWallet = await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(noWallet)).send({ toUserId: anna.id, token: 'SKR', amount: '1' }).expect(409);
    expect(fromNoWallet.body.code).toBe('WALLET_REQUIRED');
    await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: anna.id, token: 'SKR', amount: '1' }).expect(400);
    await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: randomUUID(), token: 'SKR', amount: '0.001' }).expect(400);
    await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: randomUUID(), token: 'SKR', amount: '5000' }).expect(400);

    const stranger = await registerUser(ctx);
    await verifyAge(ctx, stranger);
    await ctx.prisma.wallet.create({ data: { userId: stranger.id, address: bs58.encode(nacl.sign.keyPair().publicKey) } });
    await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: stranger.id, token: 'SKR', amount: '1' }).expect(404);
  });

  it('confirms a tip the wallet sent itself through the sweeper', async () => {
    const anna = await present();
    const ben = await present();
    const res = await ctx.http().post(`/venues/${venue.id}/tips`).set(auth(anna)).send({ toUserId: ben.id, token: 'SKR', amount: '3' }).expect(201);
    fake.landNext = 'pending';
    const signature = fake.sendFromWallet(res.body.transaction);
    fake.landNext = 'confirmed';
    const pending = await ctx.http().post(`/solana/tips/${res.body.tip.id}/confirm`).set(auth(anna)).send({ signature }).expect(201);
    expect(pending.body.status).toBe('PENDING');
    fake.land(signature);
    const swept = await ctx.app.get(TipsService).sweep();
    expect(swept.confirmed).toBeGreaterThanOrEqual(1);
    const tip = await ctx.prisma.tip.findUniqueOrThrow({ where: { id: res.body.tip.id } });
    expect(tip.status).toBe('CONFIRMED');
    expect(tip.messageId).toBeTruthy();
  });
});
