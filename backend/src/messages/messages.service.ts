import { Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, forbidden, notFound, unavailable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import type { ChatRoom, Message, MessageStatus, Tip } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { REGULAR } from '../loyalty/levels.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { MEDIA_SUMMARY_SELECT, MediaService, type MediaSummary } from '../media/media.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { type ModerationDecision, ModerationUnavailableError } from '../moderation/moderation.types.js';
import { MAX_CAPTION_LENGTH, normalizeText } from '../moderation/rules.js';
import { POLL_INCLUDE, type PollRow, toPollView } from '../polls/poll-view.js';
import { PresenceService } from '../presence/presence.service.js';
import { formatUnits } from '../solana/units.js';
import type { ChatMessageView } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { VenuesService } from '../venues/venues.service.js';

export const GUIDELINES_NOTICE = "This message doesn't meet our community guidelines.";
export const PHOTO_GUIDELINES_NOTICE = "This photo doesn't meet our community guidelines.";
const CENSOR_NOTICE = 'Part of your message was masked because it goes against the community guidelines.';
const WARN_NOTICE = 'Please keep it respectful. Repeated issues can limit your ability to chat.';
/** What clients that predate photo messages show. */
export const IMAGE_FALLBACK_TEXT = '[Photo]';

export interface SendResult {
  status: 'approved' | 'censored' | 'blocked';
  message?: ChatMessageView;
  notice?: string;
}

export type MessageRow = Message & {
  author: { id: string; displayName: string };
  media?: MediaSummary | null;
  poll?: PollRow | null;
  tip?: (Tip & { to: { id: string; displayName: string } }) | null;
};

export const MESSAGE_INCLUDE = {
  author: { select: { id: true, displayName: true } },
  media: { select: MEDIA_SUMMARY_SELECT },
  poll: { include: POLL_INCLUDE },
  tip: { include: { to: { select: { id: true, displayName: true } } } },
} as const;

export interface SendInput {
  kind?: 'TEXT' | 'IMAGE';
  room?: ChatRoom;
  text?: string;
  mediaId?: string;
  clientKey: string;
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
    private readonly media: MediaService,
    private readonly bus: RealtimeBus,
    private readonly loyalty: LoyaltyService,
  ) {}

  toView(m: MessageRow): ChatMessageView {
    const view: ChatMessageView = {
      id: m.id,
      venueId: m.venueId,
      author: { id: m.author.id, displayName: m.author.displayName },
      kind: m.kind,
      text: m.text,
      status: m.status === 'CENSORED' ? 'CENSORED' : 'APPROVED',
      createdAt: m.createdAt.toISOString(),
    };
    if (m.room === 'REGULARS') view.room = 'REGULARS';
    if (m.authorLevel > 0) view.authorLevel = m.authorLevel;
    if (m.kind === 'IMAGE') {
      view.caption = m.text === IMAGE_FALLBACK_TEXT ? '' : m.text;
      const image = this.media.toView(m.media);
      if (image) view.image = image;
    }
    if (m.kind === 'POLL' && m.poll) view.poll = toPollView(m.poll);
    if (m.kind === 'TIP' && m.tip) {
      view.tip = { id: m.tip.id, token: m.tip.token, amount: formatUnits(m.tip.amount), to: m.tip.to, signature: m.tip.signature };
    }
    return view;
  }

  /** Adds the viewer's own choice to every poll in the list (one query). */
  async withMyVotes(views: ChatMessageView[], userId: string): Promise<ChatMessageView[]> {
    const pollIds = views.flatMap((v) => (v.poll ? [v.poll.id] : []));
    if (pollIds.length === 0) return views;
    const votes = await this.prisma.pollVote.findMany({ where: { userId, pollId: { in: pollIds } }, select: { pollId: true, optionId: true } });
    const mine = new Map(votes.map((v) => [v.pollId, v.optionId]));
    for (const v of views) if (v.poll) v.poll.myOptionId = mine.get(v.poll.id) ?? null;
    return views;
  }

  async send(user: UserSnapshot, venueId: string, input: SendInput): Promise<SendResult> {
    const existing = await this.prisma.message.findUnique({
      where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } },
      include: MESSAGE_INCLUDE,
    });
    if (existing) return this.toSendResult(existing);

    const isImage = input.kind === 'IMAGE';
    const text = normalizeText(input.text ?? '');
    if (!isImage && !text) throw badRequest('VALIDATION', 'Message cannot be empty.');
    if (isImage && text.length > MAX_CAPTION_LENGTH) throw badRequest('VALIDATION', `Captions can be at most ${MAX_CAPTION_LENGTH} characters.`);
    if (isImage && !input.mediaId) throw badRequest('VALIDATION', 'Photo messages need a mediaId.');
    await this.assertCanPost(user, venueId);
    const room = input.room ?? 'MAIN';
    const authorLevel = await this.loyalty.level(user.id, venueId);
    if (room === 'REGULARS') this.assertRegular(authorLevel);

    const venue = await this.venues.getActive(venueId);
    const recent = await this.recentContext(venueId, room);
    const media = isImage ? await this.media.findUploaded(input.mediaId!, user.id) : null;

    let decision: ModerationDecision;
    try {
      decision = media
        ? await this.moderation.evaluateImageMessage({
            text,
            venueName: venue.name,
            recent,
            image: { data: await this.media.renditionForModeration(media.id), mimeType: 'image/jpeg' },
          })
        : await this.moderation.evaluateMessage({ text, venueName: venue.name, recent });
    } catch (err) {
      if (err instanceof ModerationUnavailableError) {
        throw unavailable('MODERATION_UNAVAILABLE', media ? "We couldn't check your photo. Please try again." : "We couldn't check your message. Please try again.");
      }
      throw err;
    }

    const status =
      decision.decision === 'block' ? 'BLOCKED' : decision.decision === 'censor' && decision.censoredText ? 'CENSORED' : 'APPROVED';
    const shownText = status === 'CENSORED' ? normalizeText(decision.censoredText!) || text : text;

    if (media) {
      if (status === 'BLOCKED') await this.media.reject(media.id);
      else await this.media.claim(media.id, user.id);
    }

    let message: MessageRow;
    try {
      message = await this.prisma.message.create({
        data: {
          venueId,
          authorId: user.id,
          kind: media ? 'IMAGE' : 'TEXT',
          mediaId: media?.id ?? null,
          room,
          authorLevel,
          text: media ? shownText || IMAGE_FALLBACK_TEXT : shownText,
          originalText: status === 'CENSORED' ? text : status === 'BLOCKED' ? text : null,
          status,
          severity: decision.severity,
          categories: decision.categories,
          moderationReason: decision.reason,
          clientKey: input.clientKey,
        },
        include: MESSAGE_INCLUDE,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.message.findUniqueOrThrow({
          where: { authorId_clientKey: { authorId: user.id, clientKey: input.clientKey } },
          include: MESSAGE_INCLUDE,
        });
        return this.toSendResult(raced);
      }
      throw err;
    }

    const severity = status === 'BLOCKED' ? Math.max(2, decision.severity) : decision.decision === 'allow' ? 0 : Math.max(1, decision.severity);
    if (severity > 0) {
      await this.enforcement.recordViolation(user.id, { messageId: message.id, severity, categories: decision.categories });
    }

    if (status !== 'BLOCKED') await this.publish(user.id, message);
    return this.toSendResult(message, decision);
  }

  /** Mute and presence checks shared by every kind of post. */
  async assertCanPost(user: UserSnapshot, venueId: string): Promise<void> {
    if (user.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now()) {
      throw forbidden('MUTED', "You can't send messages right now.", { mutedUntil: user.mutedUntil });
    }
    if (!(await this.presence.isEligibleToPost(user.id, venueId))) {
      throw forbidden('NOT_PRESENT', 'You need to be at this location to chat.');
    }
  }

  /** Only Regulars (level 2+) read and write in a place's Regulars room. */
  assertRegular(level: number): void {
    if (level < REGULAR) {
      throw forbidden('LEVEL_REQUIRED', `The Regulars room opens after ${this.loyalty.thresholds[0]} check-ins here.`, { requiredLevel: REGULAR });
    }
  }

  /** The last few visible messages in the room, oldest first, as classifier context. */
  async recentContext(venueId: string, room: ChatRoom = 'MAIN'): Promise<{ displayName: string; text: string }[]> {
    const rows = await this.prisma.message.findMany({
      where: { venueId, room, status: { in: ['APPROVED', 'CENSORED'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { author: { select: { displayName: true } } },
    });
    return rows.reverse().map((m) => ({ displayName: m.author.displayName, text: m.text }));
  }

  /** Fans a visible message out to the room, skipping blocked pairs; Regulars messages reach only Regulars on the Solana build. */
  async publish(authorId: string, message: MessageRow): Promise<void> {
    const excluded = await this.blocks.blockset(authorId);
    const audience = message.room === 'REGULARS' ? { userIds: await this.loyalty.regularsAt(message.venueId), build: 'solana' } : undefined;
    this.bus.toVenue(message.venueId, { type: 'message', message: this.toView(message) }, excluded, audience);
  }

  toSendResult(message: MessageRow, decision?: ModerationDecision): SendResult {
    const blockedNotice = message.kind === 'IMAGE' ? PHOTO_GUIDELINES_NOTICE : GUIDELINES_NOTICE;
    switch (message.status) {
      case 'BLOCKED':
        return { status: 'blocked', notice: blockedNotice };
      case 'CENSORED':
        return { status: 'censored', message: this.toView(message), notice: CENSOR_NOTICE };
      case 'HIDDEN':
        return { status: 'blocked', notice: blockedNotice };
      default:
        return {
          status: 'approved',
          message: this.toView(message),
          notice: decision?.decision === 'warn' ? WARN_NOTICE : undefined,
        };
    }
  }

  /** Visible history for a member, oldest first, excluding blocked relationships. */
  async history(userId: string, venueId: string, query: { afterId?: string; limit?: number; room?: ChatRoom }): Promise<ChatMessageView[]> {
    if (!(await this.presence.findActive(userId, venueId))) throw forbidden('NOT_MEMBER', 'Join the chat to see messages.');
    const room = query.room ?? 'MAIN';
    if (room === 'REGULARS') this.assertRegular(await this.loyalty.level(userId, venueId));
    const limit = query.limit ?? 50;
    const excluded = await this.blocks.blockset(userId);
    const visible: MessageStatus[] = ['APPROVED', 'CENSORED'];

    if (query.afterId) {
      const anchor = await this.prisma.message.findUnique({ where: { id: query.afterId }, select: { createdAt: true, venueId: true } });
      if (!anchor || anchor.venueId !== venueId) throw notFound('Unknown message.');
      const rows = await this.prisma.message.findMany({
        where: { venueId, room, status: { in: visible }, authorId: { notIn: excluded }, createdAt: { gt: anchor.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: MESSAGE_INCLUDE,
      });
      return this.withMyVotes(rows.map((m) => this.toView(m)), userId);
    }
    const rows = await this.prisma.message.findMany({
      where: { venueId, room, status: { in: visible }, authorId: { notIn: excluded } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MESSAGE_INCLUDE,
    });
    return this.withMyVotes(rows.reverse().map((m) => this.toView(m)), userId);
  }

  /** Hides a visible message for everyone (moderator action or report threshold). */
  async hide(messageId: string): Promise<boolean> {
    const updated = await this.prisma.message.updateManyAndReturn({
      where: { id: messageId, status: { in: ['APPROVED', 'CENSORED'] } },
      data: { status: 'HIDDEN' },
    });
    if (updated.length === 0) return false;
    if (updated[0].mediaId) await this.media.quarantine(updated[0].mediaId);
    this.bus.toVenue(updated[0].venueId, { type: 'message_hidden', venueId: updated[0].venueId, messageId });
    return true;
  }
}
