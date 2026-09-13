import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { conflict, unauthorized } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { assertDisplayNameAllowed } from './display-name.js';
import { type MeView, UsersService } from '../users/users.service.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { TokenService } from './token.service.js';

export interface AuthResult {
  accessToken: string;
  accessExpiresInSec: number;
  refreshToken: string;
  user: MeView;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
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

