import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAIL_CLIENT } from '../src/mail/mail.types.js';
import type { FakeMailClient } from '../src/testing/fake-mail.client.js';
import { auth, createTestApp, registerUser, type TestContext } from './helpers.js';

function resetCode(ctx: TestContext, email: string): string {
  const mail = ctx.app.get<FakeMailClient>(MAIL_CLIENT).lastTo(email);
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`no reset code mailed to ${email}`);
  return code;
}

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

  it('resets a forgotten password with the emailed code and signs out other devices', async () => {
    const user = await registerUser(ctx);
    await ctx.http().post('/auth/password/forgot').send({ email: user.email.toUpperCase() }).expect(204);
    const code = resetCode(ctx, user.email);

    const newPassword = 'a-brand-new-password';
    const reset = await ctx.http().post('/auth/password/reset').send({ email: user.email, code, password: newPassword }).expect(200);
    expect(reset.body.user.id).toBe(user.id);
    expect(reset.body.refreshToken).not.toBe(user.refreshToken);

    await ctx.http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await ctx.http().post('/auth/login').send({ email: user.email, password: user.password }).expect(401);
    await ctx.http().post('/auth/login').send({ email: user.email, password: newPassword }).expect(200);

    // A code works once.
    const again = await ctx.http().post('/auth/password/reset').send({ email: user.email, code, password: 'yet-another-password' }).expect(400);
    expect(again.body.code).toBe('INVALID_RESET_CODE');
  });

  it('answers the same for unknown emails and throws a code away after five wrong guesses', async () => {
    await ctx.http().post('/auth/password/forgot').send({ email: 'nobody-here@example.test' }).expect(204);
    expect(ctx.app.get<FakeMailClient>(MAIL_CLIENT).lastTo('nobody-here@example.test')).toBeUndefined();

    const user = await registerUser(ctx);
    await ctx.http().post('/auth/password/forgot').send({ email: user.email }).expect(204);
    const code = resetCode(ctx, user.email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await ctx.http().post('/auth/password/reset').send({ email: user.email, code: wrong, password: 'whatever-password' }).expect(400);
      expect(res.body.code).toBe('INVALID_RESET_CODE');
    }
    await ctx.http().post('/auth/password/reset').send({ email: user.email, code, password: 'whatever-password' }).expect(400);
    await ctx.http().post('/auth/login').send({ email: user.email, password: user.password }).expect(200);

    // Asking again within a minute does not mail another code.
    await ctx.http().post('/auth/password/forgot').send({ email: user.email }).expect(204);
    expect(resetCode(ctx, user.email)).toBe(code);
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
