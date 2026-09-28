import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '../common/errors.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { PlatformAgeDto } from './dto/platform-age.dto.js';

export const AGE_THRESHOLD = 18;

export type AgeOutcomeReason = 'under_age' | 'declined' | 'unknown_age';

export interface VerificationStatusView {
  verified: boolean;
  verifiedAt: string | null;
  ageThreshold: number;
  lastOutcome: 'PASSED' | 'FAILED' | null;
}

export interface PlatformAgeResult extends VerificationStatusView {
  reason: AgeOutcomeReason | null;
}

const PROVIDER_BY_PLATFORM = { apple: 'apple-declared-age-range', google: 'google-play-age-signals', self: 'self-declared' } as const;

/**
 * Age assurance from the operating system's age-range prompt. The app forwards the
 * platform's answer; the backend keeps only the platform, the declaration kind and
 * pass/fail. The signal is attested by the app, not by a server token (see docs).
 * Where the platform has no answer, the user may declare 18+ themselves (platform `self`);
 * it is stored under its own provider so moderators can tell those accounts apart.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async recordPlatformSignal(userId: string, dto: PlatformAgeDto): Promise<PlatformAgeResult> {
    if (dto.platform === 'self' && dto.declaration !== 'self') {
      throw badRequest('VALIDATION', 'A self-declaration must use declaration "self".');
    }
    const provider = PROVIDER_BY_PLATFORM[dto.platform];
    const reason: AgeOutcomeReason | null =
      dto.lowerBound === undefined ? (dto.declaration === 'unknown' ? 'declined' : 'unknown_age') : dto.lowerBound >= AGE_THRESHOLD ? null : 'under_age';
    const passed = reason === null;
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.verificationSession.create({
        data: { userId, provider, providerRef: dto.declaration, status: passed ? 'PASSED' : 'FAILED', completedAt: now },
      }),
      ...(passed
        ? [
            this.prisma.user.update({
              where: { id: userId },
              data: { ageVerifiedAt: now, ageThreshold: AGE_THRESHOLD, verificationProvider: provider, verificationRef: dto.declaration },
            }),
          ]
        : []),
    ]);
    if (passed) await this.users.invalidateSnapshot(userId);
    this.logger.log({ userId, provider, declaration: dto.declaration, passed }, 'platform age signal recorded');
    return { ...(await this.status(userId)), reason };
  }

  /** Test environments only: marks the caller verified without a platform prompt. */
  async markVerifiedForTests(userId: string): Promise<VerificationStatusView> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.verificationSession.create({ data: { userId, provider: 'test', providerRef: 'test', status: 'PASSED', completedAt: now } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { ageVerifiedAt: now, ageThreshold: AGE_THRESHOLD, verificationProvider: 'test', verificationRef: 'test' },
      }),
    ]);
    await this.users.invalidateSnapshot(userId);
    return this.status(userId);
  }

  async status(userId: string): Promise<VerificationStatusView> {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { ageVerifiedAt: true } }),
      this.prisma.verificationSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      verified: user.ageVerifiedAt !== null,
      verifiedAt: user.ageVerifiedAt?.toISOString() ?? null,
      ageThreshold: AGE_THRESHOLD,
      lastOutcome: latest?.status ?? null,
    };
  }
}
