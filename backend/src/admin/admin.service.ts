import { Injectable } from '@nestjs/common';
import { notFound } from '../common/errors.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { IncidentStatus, ReportStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { ListingsService } from '../market/listings.service.js';
import { OrdersService } from '../market/orders.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { PinsService } from '../pins/pins.service.js';
import { ResolveAction, type ResolveOrderDto, type ResolveReportDto } from './dto/admin.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly listings: ListingsService,
    private readonly orders: OrdersService,
    private readonly enforcement: EnforcementService,
    private readonly pins: PinsService,
  ) {}

  resolveOrder(orderId: string, dto: ResolveOrderDto) {
    return this.orders.resolve(orderId, dto.action);
  }

  listReports(status: ReportStatus = 'OPEN', limit = 50) {
    return this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        reporter: { select: { id: true, displayName: true } },
        reportedUser: { select: { id: true, displayName: true, mutedUntil: true, suspendedAt: true } },
        message: { select: { id: true, venueId: true, text: true, originalText: true, status: true, severity: true, categories: true, createdAt: true } },
        listing: { select: { id: true, kind: true, title: true, description: true, priceCents: true, status: true, createdAt: true } },
        pin: { select: { id: true, text: true, originalText: true, status: true, tier: true, lat: true, lng: true, createdAt: true, expiresAt: true } },
        pinMessage: { select: { id: true, pinId: true, text: true, originalText: true, status: true, severity: true, categories: true, createdAt: true } },
      },
    });
  }

  listIncidents(status: IncidentStatus = 'OPEN', limit = 50) {
    return this.prisma.incident.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { user: { select: { id: true, displayName: true, mutedUntil: true, suspendedAt: true } } },
    });
  }

  async getMessage(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, displayName: true, mutedUntil: true, suspendedAt: true } },
        reports: { include: { reporter: { select: { id: true, displayName: true } } } },
      },
    });
    if (!message) throw notFound('Message not found.');
    return message;
  }

  async resolveReport(reportId: string, moderatorId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw notFound('Report not found.');
    const reason = dto.note?.trim() || `Moderator action on report ${reportId}`;
    // A report targets a message, a listing, a pin or a pin message; the same decisions apply to all.
    const target = report.messageId
      ? { messageId: report.messageId }
      : report.listingId
        ? { listingId: report.listingId }
        : report.pinId
          ? { pinId: report.pinId }
          : { pinMessageId: report.pinMessageId! };
    const hideContent = () =>
      report.messageId
        ? this.messages.hide(report.messageId)
        : report.listingId
          ? this.listings.remove(report.listingId, 'moderator')
          : report.pinId
            ? this.pins.remove(report.pinId, 'moderator')
            : this.pins.hideMessage(report.pinMessageId!);
    // Violations keep pin messages under messageId (they share the chat message strike rules).
    const violationTarget = report.pinMessageId ? { messageId: report.pinMessageId } : target;
    const violation = (severity: number) =>
      this.prisma.violation.create({ data: { userId: report.reportedUserId, ...violationTarget, severity, categories: [report.reason.toLowerCase()], source: 'MODERATOR' } });

    switch (dto.action) {
      case ResolveAction.DISMISS:
        break;
      case ResolveAction.HIDE_CONTENT:
      case ResolveAction.HIDE_MESSAGE:
        await hideContent();
        break;
      case ResolveAction.MUTE:
        await hideContent();
        await violation(2);
        await this.enforcement.mute(report.reportedUserId, dto.durationHours ?? 24, reason, moderatorId);
        break;
      case ResolveAction.SUSPEND:
        await hideContent();
        await violation(3);
        await this.enforcement.suspend(report.reportedUserId, reason, moderatorId);
        break;
    }

    const status: ReportStatus = dto.action === ResolveAction.DISMISS ? 'DISMISSED' : 'ACTIONED';
    const now = new Date();
    const refId = report.messageId ?? report.listingId ?? report.pinId ?? report.pinMessageId!;
    await this.prisma.$transaction([
      // Every open report on the same target is settled by this decision.
      this.prisma.report.updateMany({ where: { ...target, status: 'OPEN' }, data: { status, reviewedById: moderatorId, reviewedAt: now } }),
      this.prisma.incident.updateMany({ where: { refId, status: 'OPEN' }, data: { status: 'RESOLVED' } }),
    ]);
    return { reportId, status };
  }

  async resolveIncident(id: string) {
    const updated = await this.prisma.incident.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'RESOLVED' } });
    if (updated.count === 0) throw notFound('Open incident not found.');
    return { id, status: 'RESOLVED' as const };
  }

  async suspendUser(userId: string, moderatorId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
    if (!user || user.deletedAt) throw notFound('User not found.');
    await this.enforcement.suspend(userId, reason, moderatorId);
    return { userId, suspended: true };
  }

  async unsuspendUser(userId: string) {
    await this.enforcement.unsuspend(userId);
    return { userId, suspended: false };
  }
}
