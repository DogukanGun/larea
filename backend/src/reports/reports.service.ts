import { Injectable, Logger } from '@nestjs/common';
import { badRequest, notFound } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { ReportReason } from '../generated/prisma/enums.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { MessagesService } from '../messages/messages.service.js';

export interface ReportResult {
  reportId: string;
  received: true;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  async create(reporterId: string, messageId: string, input: { reason: ReportReason; details?: string }): Promise<ReportResult> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId }, select: { id: true, authorId: true, status: true } });
    if (!message || message.status === 'BLOCKED') throw notFound('Message not found.');
    if (message.authorId === reporterId) throw badRequest('CANNOT_REPORT_SELF', "You can't report your own message.");

    const report = await this.prisma.report.upsert({
      where: { reporterId_messageId: { reporterId, messageId } },
      update: {},
      create: { reporterId, messageId, reportedUserId: message.authorId, reason: input.reason, details: input.details?.trim() || null },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const distinctReporters = await this.prisma.report.groupBy({ by: ['reporterId'], where: { messageId, createdAt: { gte: since } } });
    if (distinctReporters.length >= this.env.REPORT_AUTO_HIDE_THRESHOLD && message.status !== 'HIDDEN') {
      const hidden = await this.messages.hide(messageId);
      if (hidden) {
        await this.prisma.incident.create({ data: { userId: message.authorId, kind: 'REPORT_THRESHOLD', refId: messageId } });
        this.logger.log({ messageId, reporters: distinctReporters.length }, 'message hidden after reports');
      }
    }
    return { reportId: report.id, received: true };
  }
}
