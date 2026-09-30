import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siwsMessage } from '../src/solana/siws.js';
import { auth, createTestApp, registerUser, type TestContext, verifyAge } from './helpers.js';

describe('solana wallet linking', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function signIn(user: { accessToken: string }, keys = nacl.sign.keyPair()) {
    const address = bs58.encode(keys.publicKey);
    const challenge = await ctx.http().post('/solana/wallet/challenge').set(auth(user)).expect(201);
    const message = new TextEncoder().encode(siwsMessage(address, challenge.body));
    return {
      address,
      body: {
        address,
        message: Buffer.from(message).toString('base64'),
        signature: Buffer.from(nacl.sign.detached(message, keys.secretKey)).toString('base64'),
      },
    };
  }

  it('links the wallet that signed the challenge and shows it on /me', async () => {
    const user = await registerUser(ctx);
    await verifyAge(ctx, user);
    const { address, body } = await signIn(user);
    const linked = await ctx.http().post('/solana/wallet').set(auth(user)).send(body).expect(201);
    expect(linked.body).toMatchObject({ address, cluster: 'localnet' });
    const me = await ctx.http().get('/me').set(auth(user)).expect(200);
    expect(me.body.walletAddress).toBe(address);
    const wallet = await ctx.http().get('/solana/wallet').set(auth(user)).expect(200);
    expect(wallet.body.balances).toEqual({ sol: 0, usdc: 0, skr: 0 });

    // The nonce is single-use.
    await ctx.http().post('/solana/wallet').set(auth(user)).send(body).expect(400);

    await ctx.http().delete('/solana/wallet').set(auth(user)).expect(204);
    expect((await ctx.http().get('/me').set(auth(user)).expect(200)).body.walletAddress).toBeNull();
  });

  it('refuses a signature from another key and a wallet that belongs to someone else', async () => {
    const user = await registerUser(ctx);
    const { body } = await signIn(user);
    const forged = { ...body, signature: Buffer.from(nacl.sign.detached(Buffer.from(body.message, 'base64'), nacl.sign.keyPair().secretKey)).toString('base64') };
    const bad = await ctx.http().post('/solana/wallet').set(auth(user)).send(forged).expect(400);
    expect(bad.body.code).toBe('INVALID_SIGNATURE');

    const keys = nacl.sign.keyPair();
    const first = await registerUser(ctx);
    await ctx.http().post('/solana/wallet').set(auth(first)).send((await signIn(first, keys)).body).expect(201);
    const second = await registerUser(ctx);
    const taken = await ctx.http().post('/solana/wallet').set(auth(second)).send((await signIn(second, keys)).body).expect(409);
    expect(taken.body.code).toBe('WALLET_TAKEN');
  });
});
