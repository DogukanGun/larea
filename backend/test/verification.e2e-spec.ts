import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, type TestContext } from './helpers.js';

describe('age assurance from platform signals', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('passes an adult age range from Apple and stores only platform, declaration and outcome', async () => {
    const user = await registerUser(ctx);
    const before = await ctx.http().get('/verification/status').set(auth(user)).expect(200);
    expect(before.body).toMatchObject({ verified: false, ageThreshold: 18, lastOutcome: null });

    const res = await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'apple', lowerBound: 18, declaration: 'self' }).expect(200);
    expect(res.body).toMatchObject({ verified: true, reason: null, lastOutcome: 'PASSED' });

    const me = await ctx.http().get('/me').set(auth(user)).expect(200);
    expect(me.body.ageVerified).toBe(true);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ ageThreshold: 18, verificationProvider: 'apple-declared-age-range', verificationRef: 'self' });
    const session = await ctx.prisma.verificationSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session).toMatchObject({ provider: 'apple-declared-age-range', providerRef: 'self', status: 'PASSED' });
    expect(Object.keys(session)).not.toContain('dateOfBirth');
  });

  it('fails under-age, declined and unknown answers without verifying', async () => {
    const user = await registerUser(ctx);
    const underAge = await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'google', lowerBound: 16, upperBound: 17, declaration: 'guardian' }).expect(200);
    expect(underAge.body).toMatchObject({ verified: false, reason: 'under_age', lastOutcome: 'FAILED' });

    const declined = await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'apple', declaration: 'unknown' }).expect(200);
    expect(declined.body).toMatchObject({ verified: false, reason: 'declined' });

    const unknown = await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'apple', declaration: 'self' }).expect(200);
    expect(unknown.body).toMatchObject({ verified: false, reason: 'unknown_age' });

    const me = await ctx.http().get('/me').set(auth(user)).expect(200);
    expect(me.body.ageVerified).toBe(false);
    const nearby = await ctx.http().get('/venues/nearby').query({ lat: 52.5, lng: 13.4, accuracy: 10 }).set(auth(user)).expect(403);
    expect(nearby.body.code).toBe('AGE_VERIFICATION_REQUIRED');
  });

  it('accepts a self-declaration where the platform has no answer and records it separately', async () => {
    const user = await registerUser(ctx);
    const res = await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'self', lowerBound: 18, declaration: 'self' }).expect(200);
    expect(res.body).toMatchObject({ verified: true, reason: null, lastOutcome: 'PASSED' });
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ verificationProvider: 'self-declared', verificationRef: 'self' });

    const other = await registerUser(ctx);
    const under = await ctx.http().post('/verification/platform').set(auth(other)).send({ platform: 'self', lowerBound: 17, declaration: 'self' }).expect(200);
    expect(under.body).toMatchObject({ verified: false, reason: 'under_age' });
    await ctx.http().post('/verification/platform').set(auth(other)).send({ platform: 'self', lowerBound: 18, declaration: 'confirmed' }).expect(400);
  });

  it('validates the payload', async () => {
    const user = await registerUser(ctx);
    await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'windows', declaration: 'self' }).expect(400);
    await ctx.http().post('/verification/platform').set(auth(user)).send({ platform: 'apple', lowerBound: -1, declaration: 'self' }).expect(400);
  });
});
