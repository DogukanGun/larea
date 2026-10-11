import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';
import { badRequest, conflict, unauthorized, unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { MAIL_CLIENT, type MailClient } from '../mail/mail.types.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { assertDisplayNameAllowed } from './display-name.js';
import { type MeView, UsersService } from '../users/users.service.js';
import type { LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto.js';
import { TokenService } from './token.service.js';

export interface AuthResult {
  accessToken: string;
  accessExpiresInSec: number;
  refreshToken: string;
  user: MeView;
}

/** Wrong guesses allowed per emailed code before it is thrown away. */
const RESET_MAX_ATTEMPTS = 5;
/** A new code for the same email is sent at most this often. */
const RESET_RESEND_SEC = 60;

interface PendingReset {
  codeHash: string;
  attempts: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(MAIL_CLIENT) private readonly mail: MailClient | null,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly moderation: ModerationService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();

    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    }
    if (await this.users.isDisplayNameTaken(displayName)) {
      throw conflict('DISPLAY_NAME_TAKEN', 'That display name is already in use.');
    }
    await assertDisplayNameAllowed(this.moderation, displayName);

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    let userId: string;
    try {
      ({ id: userId } = await this.prisma.user.create({
        data: { email, passwordHash, displayName, displayNameLower: displayName.toLowerCase() },
        select: { id: true },
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String((err.meta as { target?: unknown })?.target ?? '');
        throw target.includes('email')
          ? conflict('EMAIL_TAKEN', 'An account with this email already exists.')
          : conflict('DISPLAY_NAME_TAKEN', 'That display name is already in use.');
      }
      throw err;
    }
    return this.issue(userId, dto.deviceLabel);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, deletedAt: true } });
    const invalid = unauthorized('Email or password is incorrect.');
    if (!user || user.deletedAt) throw invalid;
    if (!(await argon2.verify(user.passwordHash, dto.password))) throw invalid;
    return this.issue(user.id, dto.deviceLabel);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { user: { select: { id: true, role: true, deletedAt: true } } },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now() || record.user.deletedAt) {
      throw unauthorized('Your session expired. Please sign in again.');
    }
    const accessToken = await this.tokens.signAccess({ userId: record.user.id, role: record.user.role });
    const me = await this.users.me(record.user.id);
    if (!me) throw unauthorized();
    return { accessToken, accessExpiresInSec: this.tokens.accessTtlSec, refreshToken, user: me };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Emails a six-digit reset code. Answers the same whether or not the account exists, and sends
   * the mail in the background so the response time does not tell either.
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const mail = this.mail;
    if (!mail) throw unavailable('PASSWORD_RESET_UNAVAILABLE', "Password reset isn't available right now. Please try again later.");
    const email = rawEmail.trim().toLowerCase();
    if (!(await this.redis.acquireLock(`pwreset:resend:${email}`, RESET_RESEND_SEC * 1000))) return;
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) return;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const pending: PendingReset = { codeHash: this.hashResetCode(user.id, code), attempts: 0 };
    await this.redis.client.set(this.resetKey(user.id), JSON.stringify(pending), 'EX', this.env.PASSWORD_RESET_TTL_MIN * 60);
    const minutes = this.env.PASSWORD_RESET_TTL_MIN;
    mail
      .send({
        to: email,
        subject: `Your Larea code: ${code}`,
        text: `Your Larea password reset code is ${code}.\n\nIt expires in ${minutes} minutes. If you didn't ask to reset your password, ignore this email; your password stays the same.\n`,
      })
      .catch((err: unknown) => this.logger.error({ event: 'mail.failed', kind: 'password_reset', err: String(err) }));
  }

  /** Sets a new password with an emailed code, signs out every other device and signs in here. */
  async resetPassword(dto: ResetPasswordDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const invalid = badRequest('INVALID_RESET_CODE', 'That code is wrong or has expired. Request a new one.');
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) throw invalid;

    const key = this.resetKey(user.id);
    const raw = await this.redis.client.get(key);
    if (!raw) throw invalid;
    const pending = JSON.parse(raw) as PendingReset;
    const given = Buffer.from(this.hashResetCode(user.id, dto.code), 'hex');
    if (!timingSafeEqual(given, Buffer.from(pending.codeHash, 'hex'))) {
      pending.attempts += 1;
      if (pending.attempts >= RESET_MAX_ATTEMPTS) await this.redis.client.del(key);
      else await this.redis.client.set(key, JSON.stringify(pending), 'KEEPTTL');
      throw invalid;
    }
    // Only one request can consume the code.
    if ((await this.redis.client.del(key)) !== 1) throw invalid;

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    this.logger.log({ event: 'auth.password_reset', userId: user.id });
    return this.issue(user.id, dto.deviceLabel);
  }

  private resetKey(userId: string): string {
    return `pwreset:${userId}`;
  }

  private hashResetCode(userId: string, code: string): string {
    return createHmac('sha256', this.env.JWT_ACCESS_SECRET).update(`${userId}:${code}`).digest('hex');
  }

  private async issue(userId: string, deviceLabel?: string): Promise<AuthResult> {
    const refreshToken = this.tokens.generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [, user] = await Promise.all([
      this.prisma.refreshToken.create({
        data: { userId, tokenHash: this.tokens.hashRefreshToken(refreshToken), deviceLabel: deviceLabel?.trim() || null, expiresAt },
      }),
      this.users.me(userId),
    ]);
    if (!user) throw unauthorized();
    const accessToken = await this.tokens.signAccess({ userId, role: user.role as never });
    return { accessToken, accessExpiresInSec: this.tokens.accessTtlSec, refreshToken, user };
  }
}

