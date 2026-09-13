import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, type TestContext } from './helpers.js';

describe('auth and profile', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('registers, returns the profile, refreshes and logs out', async () => {
    const user = await registerUser(ctx);

    const me = await ctx.http().get('/me').set(auth(user)).expect(200);
    expect(me.body).toMatchObject({ email: user.email, displayName: user.displayName, ageVerified: false, activeMembership: null });

    const refreshed = await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
    expect(refreshed.body.accessToken).toBeTypeOf('string');
    expect(refreshed.body.refreshToken).toBe(user.refreshToken);

    await ctx.http().post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    const afterLogout = await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    expect(afterLogout.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects duplicate email and display name with distinct codes', async () => {
    const user = await registerUser(ctx);
    const dupEmail = await ctx.http().post('/auth/register').send({ email: user.email.toUpperCase(), password: user.password, displayName: 'someone_else' }).expect(409);
    expect(dupEmail.body.code).toBe('EMAIL_TAKEN');
    const dupName = await ctx.http().post('/auth/register').send({ email: `x-${user.email}`, password: user.password, displayName: user.displayName.toUpperCase() }).expect(409);
    expect(dupName.body.code).toBe('DISPLAY_NAME_TAKEN');
  });

  it('validates input with a readable message', async () => {
    const res = await ctx.http().post('/auth/register').send({ email: 'nope', password: 'short', displayName: 'x' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION' });
    expect(res.body.message).toMatch(/email/i);
  });

  it('signs in with the right password only', async () => {
    const user = await registerUser(ctx);
    await ctx.http().post('/auth/login').send({ email: user.email, password: 'wrong-password-123' }).expect(401);
    const ok = await ctx.http().post('/auth/login').send({ email: user.email, password: user.password }).expect(200);
    expect(ok.body.user.id).toBe(user.id);
  });

  it('rejects missing or bad tokens', async () => {
    await ctx.http().get('/me').expect(401);
    await ctx.http().get('/me').set({ Authorization: 'Bearer not-a-token' }).expect(401);
  });

  it('changes the display name and deletes the account', async () => {
    const user = await registerUser(ctx);
    const updated = await ctx.http().patch('/me').set(auth(user)).send({ displayName: 'new name 1' }).expect(200);
    expect(updated.body.displayName).toBe('new name 1');

    await ctx.http().delete('/me').set(auth(user)).expect(204);
    await ctx.http().get('/me').set(auth(user)).expect(401);
    await ctx.http().post('/auth/login').send({ email: user.email, password: user.password }).expect(401);
  });

  it('reports health', async () => {
    const res = await ctx.http().get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: true, redis: true, uploads: { writable: true } });
    expect(typeof res.body.uploads.freeBytes).toBe('number');
    // Other specs leave failed webhook rows in the shared test database, so only the shape is asserted.
    expect(typeof res.body.stripe.failedLastHour).toBe('number');
  });
});
