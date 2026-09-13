import { Injectable } from '@nestjs/common';
import { notFound } from '../common/errors.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { IncidentStatus, ReportStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { ResolveAction, type ResolveReportDto } from './dto/admin.dto.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly enforcement: EnforcementService,
  ) {}

  listReports(status: ReportStatus = 'OPEN', limit = 50) {
    return this.prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        reporter: { select: { id: true, displayName: true } },
        reportedUser: { select: { id: true, displayName: true, mutedUntil: true, suspendedAt: true } },
        message: { select: { id: true, venueId: true, text: true, originalText: true, status: true, severity: true, categories: true, createdAt: true } },
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

    switch (dto.action) {
      case ResolveAction.DISMISS:
        break;
      case ResolveAction.HIDE_MESSAGE:
        await this.messages.hide(report.messageId);
        break;
      case ResolveAction.MUTE:
        await this.messages.hide(report.messageId);
        await this.prisma.violation.create({ data: { userId: report.reportedUserId, messageId: report.messageId, severity: 2, categories: [report.reason.toLowerCase()], source: 'MODERATOR' } });
        await this.enforcement.mute(report.reportedUserId, dto.durationHours ?? 24, reason, moderatorId);
        break;
      case ResolveAction.SUSPEND:
        await this.messages.hide(report.messageId);
        await this.prisma.violation.create({ data: { userId: report.reportedUserId, messageId: report.messageId, severity: 3, categories: [report.reason.toLowerCase()], source: 'MODERATOR' } });
        await this.enforcement.suspend(report.reportedUserId, reason, moderatorId);
        break;
    }

    const status: ReportStatus = dto.action === ResolveAction.DISMISS ? 'DISMISSED' : 'ACTIONED';
    const now = new Date();
    await this.prisma.$transaction([
      // Every open report on the same message is settled by this decision.
      this.prisma.report.updateMany({ where: { messageId: report.messageId, status: 'OPEN' }, data: { status, reviewedById: moderatorId, reviewedAt: now } }),
      this.prisma.incident.updateMany({ where: { refId: report.messageId, status: 'OPEN' }, data: { status: 'RESOLVED' } }),
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
