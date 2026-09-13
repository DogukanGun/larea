import { Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, forbidden, notFound, unavailable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { Message, MessageStatus } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { type ModerationDecision, ModerationUnavailableError } from '../moderation/moderation.types.js';
import { normalizeText } from '../moderation/rules.js';
import { PresenceService } from '../presence/presence.service.js';
import type { ChatMessageView } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { VenuesService } from '../venues/venues.service.js';

export const GUIDELINES_NOTICE = "This message doesn't meet our community guidelines.";
const CENSOR_NOTICE = 'Part of your message was masked because it goes against the community guidelines.';
const WARN_NOTICE = 'Please keep it respectful. Repeated issues can limit your ability to chat.';

export interface SendResult {
  status: 'approved' | 'censored' | 'blocked';
  message?: ChatMessageView;
  notice?: string;
}

type MessageWithAuthor = Message & { author: { id: string; displayName: string } };

export function toChatMessageView(m: MessageWithAuthor): ChatMessageView {
  return {
    id: m.id,
    venueId: m.venueId,
    author: { id: m.author.id, displayName: m.author.displayName },
    text: m.text,
    status: m.status === 'CENSORED' ? 'CENSORED' : 'APPROVED',
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly venues: VenuesService,
    private readonly moderation: ModerationService,
    private readonly enforcement: EnforcementService,
    private readonly blocks: BlocksService,
    private readonly bus: RealtimeBus,
  ) {}

  async send(user: UserSnapshot, venueId: string, input: { text: string; clientKey: string }): Promise<SendResult> {
    const existing = await this.prisma.message.findUnique({
      where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } },
      include: { author: { select: { id: true, displayName: true } } },
    });
    if (existing) return this.toSendResult(existing);

    const text = normalizeText(input.text);
    if (!text) throw badRequest('VALIDATION', 'Message cannot be empty.');
    if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
      throw forbidden('MUTED', "You can't send messages right now.", { mutedUntil: user.mutedUntil });
    }
    if (!(await this.presence.isEligibleToPost(user.id, venueId))) {
      throw forbidden('NOT_PRESENT', 'You need to be at this location to chat.');
    }

    const venue = await this.venues.getActive(venueId);
    const recentRows = await this.prisma.message.findMany({
      where: { venueId, status: { in: ['APPROVED', 'CENSORED'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { author: { select: { displayName: true } } },
    });
    const recent = recentRows.reverse().map((m) => ({ displayName: m.author.displayName, text: m.text }));

    let decision: ModerationDecision;
    try {
      decision = await this.moderation.evaluateMessage({ text, venueName: venue.name, recent });
    } catch (err) {
      if (err instanceof ModerationUnavailableError) {
        throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check your message. Please try again.");
      }
      throw err;
    }

    const status =
      decision.decision === 'block' ? 'BLOCKED' : decision.decision === 'censor' && decision.censoredText ? 'CENSORED' : 'APPROVED';
    const shownText = status === 'CENSORED' ? normalizeText(decision.censoredText!) || text : text;

    let message: MessageWithAuthor;
    try {
      message = await this.prisma.message.create({
        data: {
          venueId,
          authorId: user.id,
          text: shownText,
          originalText: status === 'CENSORED' ? text : status === 'BLOCKED' ? text : null,
          status,
          severity: decision.severity,
          categories: decision.categories,
          moderationReason: decision.reason,
          clientKey: input.clientKey,
        },
        include: { author: { select: { id: true, displayName: true } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.message.findUniqueOrThrow({
          where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } },
          include: { author: { select: { id: true, displayName: true } } },
        });
        return this.toSendResult(raced);
      }
      throw err;
    }

    const severity = status === 'BLOCKED' ? Math.max(2, decision.severity) : decision.decision === 'allow' ? 0 : Math.max(1, decision.severity);
    if (severity > 0) {
      await this.enforcement.recordViolation(user.id, { messageId: message.id, severity, categories: decision.categories });
    }

    if (status !== 'BLOCKED') {
      const excluded = await this.blocks.blockset(user.id);
      this.bus.toVenue(venueId, { type: 'message', message: toChatMessageView(message) }, excluded);
    }
    return this.toSendResult(message, decision);
  }

  private toSendResult(message: MessageWithAuthor, decision?: ModerationDecision): SendResult {
    switch (message.status) {
      case 'BLOCKED':
        return { status: 'blocked', notice: GUIDELINES_NOTICE };
      case 'CENSORED':
        return { status: 'censored', message: toChatMessageView(message), notice: CENSOR_NOTICE };
      case 'HIDDEN':
        return { status: 'blocked', notice: GUIDELINES_NOTICE };
      default:
        return {
          status: 'approved',
          message: toChatMessageView(message),
          notice: decision?.decision === 'warn' ? WARN_NOTICE : undefined,
        };
    }
  }

  /** Visible history for a member, oldest first, excluding blocked relationships. */
  async history(userId: string, venueId: string, query: { afterId?: string; limit?: number }): Promise<ChatMessageView[]> {
    if (!(await this.presence.findActive(userId, venueId))) throw forbidden('NOT_MEMBER', 'Join the chat to see messages.');
    const limit = query.limit ?? 50;
    const excluded = await this.blocks.blockset(userId);
    const visible: MessageStatus[] = ['APPROVED', 'CENSORED'];

    if (query.afterId) {
      const anchor = await this.prisma.message.findUnique({ where: { id: query.afterId }, select: { createdAt: true, venueId: true } });
      if (!anchor || anchor.venueId !== venueId) throw notFound('Unknown message.');
      const rows = await this.prisma.message.findMany({
        where: { venueId, status: { in: visible }, authorId: { notIn: excluded }, createdAt: { gt: anchor.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: { author: { select: { id: true, displayName: true } } },
      });
      return rows.map(toChatMessageView);
    }
    const rows = await this.prisma.message.findMany({
      where: { venueId, status: { in: visible }, authorId: { notIn: excluded } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { author: { select: { id: true, displayName: true } } },
    });
    return rows.reverse().map(toChatMessageView);
  }

  /** Hides a visible message for everyone (moderator action or report threshold). */
  async hide(messageId: string): Promise<boolean> {
    const updated = await this.prisma.message.updateManyAndReturn({
      where: { id: messageId, status: { in: ['APPROVED', 'CENSORED'] } },
      data: { status: 'HIDDEN' },
    });
    if (updated.length === 0) return false;
    this.bus.toVenue(updated[0].venueId, { type: 'message_hidden', venueId: updated[0].venueId, messageId });
    return true;
  }
}
