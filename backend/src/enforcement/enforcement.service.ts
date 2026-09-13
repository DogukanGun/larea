import { Injectable, Logger } from '@nestjs/common';
import type { IncidentKind, ViolationSource } from '../generated/prisma/enums.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { STRIKE_WINDOW_DAYS, evaluateStrikes } from '../moderation/strike-policy.js';
import { PresenceService } from '../presence/presence.service.js';
import { CLOSE_SUSPENDED } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { UsersService } from '../users/users.service.js';

export interface ViolationInput {
  messageId?: string;
  severity: number;
  categories: string[];
  source?: ViolationSource;
}

@Injectable()
export class EnforcementService {
  private readonly logger = new Logger(EnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly bus: RealtimeBus,
  ) {}

  /** Records a violation and applies the strike policy. */
  async recordViolation(userId: string, input: ViolationInput): Promise<void> {
    await this.prisma.violation.create({
      data: { userId, messageId: input.messageId, severity: input.severity, categories: input.categories, source: input.source ?? 'AUTO' },
    });
    const since = new Date(Date.now() - STRIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = await this.prisma.violation.findMany({ where: { userId, createdAt: { gte: since } }, select: { severity: true } });
    const outcome = evaluateStrikes({ recentSeverities: recent.map((v) => v.severity), latestSeverity: input.severity });

    if (outcome.action === 'mute') {
      await this.mute(userId, outcome.muteHours!, 'Repeated violations of the community guidelines.', 'SYSTEM');
    } else if (outcome.action === 'suspend') {
      await this.suspend(userId, 'Strike threshold reached.', 'SYSTEM');
    }
    if (outcome.incident) await this.openIncident(userId, outcome.incident, input.messageId);
  }

  async mute(userId: string, hours: number, reason: string, createdBy: string): Promise<Date> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { mutedUntil: true } });
    const proposed = new Date(Date.now() + hours * 60 * 60 * 1000);
    const until = user.mutedUntil && user.mutedUntil > proposed ? user.mutedUntil : proposed;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { mutedUntil: until } }),
      this.prisma.enforcement.create({ data: { userId, kind: 'MUTE', reason, expiresAt: until, createdBy } }),
    ]);
    await this.users.invalidateSnapshot(userId);
    const hoursLeft = Math.max(1, Math.round((until.getTime() - Date.now()) / (60 * 60 * 1000)));
    this.bus.toUser(userId, {
      type: 'enforcement',
      kind: 'mute',
      until: until.toISOString(),
      message: `You can't send messages for the next ${hoursLeft === 1 ? 'hour' : `${hoursLeft} hours`} because of repeated guideline violations.`,
    });
    this.logger.log({ userId, until, createdBy }, 'user muted');
    return until;
  }

  async suspend(userId: string, reason: string, createdBy: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: new Date(), suspensionReason: reason } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.enforcement.create({ data: { userId, kind: 'SUSPEND', reason, createdBy } }),
    ]);
    await this.users.invalidateSnapshot(userId);
    await this.presence.endAllForUser(userId, 'SUSPENDED');
    this.bus.toUser(userId, { type: 'enforcement', kind: 'suspend', until: null, message: 'Your account has been suspended pending review.' });
    this.bus.closeUser(userId, CLOSE_SUSPENDED, 'suspended');
    this.logger.warn({ userId, createdBy }, 'user suspended');
  }

  async unsuspend(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: null, suspensionReason: null } });
    await this.users.invalidateSnapshot(userId);
  }

  async openIncident(userId: string, kind: IncidentKind, refId?: string): Promise<void> {
    await this.prisma.incident.create({ data: { userId, kind, refId } });
  }
}
