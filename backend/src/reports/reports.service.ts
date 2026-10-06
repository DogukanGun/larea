import { Injectable, Logger } from '@nestjs/common';
import { badRequest, notFound } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { ReportReason } from '../generated/prisma/enums.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { ListingsService } from '../market/listings.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { PinsService } from '../pins/pins.service.js';

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
    private readonly listings: ListingsService,
    private readonly pins: PinsService,
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

  /** Same rules for a marketplace listing: idempotent per reporter, removed at the threshold. */
  async createForListing(reporterId: string, listingId: string, input: { reason: ReportReason; details?: string }): Promise<ReportResult> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, ownerId: true, status: true } });
    if (!listing || listing.status === 'REMOVED') throw notFound('Listing not found.');
    if (listing.ownerId === reporterId) throw badRequest('CANNOT_REPORT_SELF', "You can't report your own listing.");

    const report = await this.prisma.report.upsert({
      where: { reporterId_listingId: { reporterId, listingId } },
      update: {},
      create: { reporterId, listingId, reportedUserId: listing.ownerId, reason: input.reason, details: input.details?.trim() || null },
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const distinctReporters = await this.prisma.report.groupBy({ by: ['reporterId'], where: { listingId, createdAt: { gte: since } } });
    if (distinctReporters.length >= this.env.REPORT_AUTO_HIDE_THRESHOLD) {
      const removed = await this.listings.remove(listingId, 'reports');
      if (removed) {
        await this.prisma.incident.create({ data: { userId: listing.ownerId, kind: 'REPORT_THRESHOLD', refId: listingId } });
        this.logger.log({ listingId, reporters: distinctReporters.length }, 'listing removed after reports');
      }
    }
    return { reportId: report.id, received: true };
  }

  /** A pinned message: taken off the map at the threshold. */
  async createForPin(reporterId: string, pinId: string, input: { reason: ReportReason; details?: string }): Promise<ReportResult> {
    const pin = await this.prisma.pin.findUnique({ where: { id: pinId }, select: { id: true, ownerId: true, status: true } });
    if (!pin || pin.status !== 'ACTIVE') throw notFound('Pin not found.');
    if (pin.ownerId === reporterId) throw badRequest('CANNOT_REPORT_SELF', "You can't report your own pin.");

    const report = await this.prisma.report.upsert({
      where: { reporterId_pinId: { reporterId, pinId } },
      update: {},
      create: { reporterId, pinId, reportedUserId: pin.ownerId, reason: input.reason, details: input.details?.trim() || null },
    });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const distinctReporters = await this.prisma.report.groupBy({ by: ['reporterId'], where: { pinId, createdAt: { gte: since } } });
    if (distinctReporters.length >= this.env.REPORT_AUTO_HIDE_THRESHOLD && (await this.pins.remove(pinId, 'reports'))) {
      await this.prisma.incident.create({ data: { userId: pin.ownerId, kind: 'REPORT_THRESHOLD', refId: pinId } });
      this.logger.log({ pinId, reporters: distinctReporters.length }, 'pin removed after reports');
    }
    return { reportId: report.id, received: true };
  }

  /** A message in a pin's chat: hidden at the threshold, like venue chat messages. */
  async createForPinMessage(reporterId: string, pinMessageId: string, input: { reason: ReportReason; details?: string }): Promise<ReportResult> {
    const message = await this.prisma.pinMessage.findUnique({ where: { id: pinMessageId }, select: { id: true, authorId: true, status: true } });
    if (!message || message.status === 'BLOCKED') throw notFound('Message not found.');
    if (message.authorId === reporterId) throw badRequest('CANNOT_REPORT_SELF', "You can't report your own message.");

    const report = await this.prisma.report.upsert({
      where: { reporterId_pinMessageId: { reporterId, pinMessageId } },
      update: {},
      create: { reporterId, pinMessageId, reportedUserId: message.authorId, reason: input.reason, details: input.details?.trim() || null },
    });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const distinctReporters = await this.prisma.report.groupBy({ by: ['reporterId'], where: { pinMessageId, createdAt: { gte: since } } });
    if (distinctReporters.length >= this.env.REPORT_AUTO_HIDE_THRESHOLD && (await this.pins.hideMessage(pinMessageId))) {
      await this.prisma.incident.create({ data: { userId: message.authorId, kind: 'REPORT_THRESHOLD', refId: pinMessageId } });
      this.logger.log({ pinMessageId, reporters: distinctReporters.length }, 'pin message hidden after reports');
    }
    return { reportId: report.id, received: true };
  }
}
