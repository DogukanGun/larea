import { Injectable } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { EnforcementService } from '../enforcement/enforcement.service.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { MESSAGE_INCLUDE, MessagesService, type SendResult } from '../messages/messages.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { ModerationUnavailableError } from '../moderation/moderation.types.js';
import { normalizeText } from '../moderation/rules.js';
import { PresenceService } from '../presence/presence.service.js';
import type { ChatPollView } from '../realtime/protocol.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { VenuesService } from '../venues/venues.service.js';
import type { CreatePollDto } from './dto/polls.dto.js';
import { POLL_INCLUDE, type PollRow, isPollClosed, pollFallbackText, toPollView } from './poll-view.js';

const POLL_NOTICE = "Polls can't contain that language. Please rephrase it.";
/** Open polls one member may have per venue at a time. */
const MAX_OPEN_POLLS = 2;
/** Vote bursts are coalesced into one fan-out per poll. */
const BROADCAST_DEBOUNCE_MS = 500;

@Injectable()
export class PollsService {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly messages: MessagesService,
    private readonly presence: PresenceService,
    private readonly venues: VenuesService,
    private readonly moderation: ModerationService,
    private readonly enforcement: EnforcementService,
    private readonly blocks: BlocksService,
    private readonly bus: RealtimeBus,
  ) {}

  /** Creates the poll and its message in one go, after moderating question and options as one text. */
  async create(user: UserSnapshot, venueId: string, dto: CreatePollDto): Promise<SendResult> {
    const existing = await this.prisma.message.findUnique({
      where: { authorId_clientKey: { authorId: user.id, clientKey: dto.clientKey } },
      include: MESSAGE_INCLUDE,
    });
    if (existing) return this.withMyVote(this.messages.toSendResult(existing), existing.poll?.id, user.id);

    const question = normalizeText(dto.question);
    const options = dto.options.map(normalizeText).filter(Boolean);
    if (!question) throw badRequest('VALIDATION', 'Ask a question.');
    if (options.length < 2) throw badRequest('VALIDATION', 'A poll needs at least two options.');
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw badRequest('VALIDATION', 'Options must be different from each other.');
    await this.messages.assertCanPost(user, venueId);
    const venue = await this.venues.getActive(venueId);

    const open = await this.prisma.poll.count({ where: { authorId: user.id, venueId, closed: false, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }], message: { status: { in: ['APPROVED', 'CENSORED'] } } } });
    if (open >= MAX_OPEN_POLLS) throw conflict('TOO_MANY_POLLS', 'Close one of your open polls before starting another.');

    const recent = await this.messages.recentContext(venueId);
    let decision;
    try {
      decision = await this.moderation.evaluateMessage({ text: [question, ...options].join('\n'), venueName: venue.name, recent });
    } catch (err) {
      if (err instanceof ModerationUnavailableError) throw unavailable('MODERATION_UNAVAILABLE', "We couldn't check your poll. Please try again.");
      throw err;
    }

    if (decision.decision === 'block' || decision.decision === 'censor') {
      // A poll cannot be partially masked; ask for a rephrase and keep the record.
      const blocked = await this.prisma.message.create({
        data: {
          venueId,
          authorId: user.id,
          kind: 'POLL',
          text: pollFallbackText(question),
          originalText: [question, ...options].join('\n'),
          status: 'BLOCKED',
          severity: decision.severity,
          categories: decision.categories,
          moderationReason: decision.reason,
          clientKey: dto.clientKey,
        },
      });
      await this.enforcement.recordViolation(user.id, { messageId: blocked.id, severity: Math.max(1, decision.severity), categories: decision.categories });
      return { status: 'blocked', notice: POLL_NOTICE };
    }

    const closesAt = dto.durationMinutes ? new Date(Date.now() + dto.durationMinutes * 60_000) : null;
    const created = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          venueId,
          authorId: user.id,
          kind: 'POLL',
          text: pollFallbackText(question),
          status: 'APPROVED',
          severity: decision.severity,
          categories: decision.categories,
          moderationReason: decision.reason,
          clientKey: dto.clientKey,
        },
      });
      await tx.poll.create({
        data: {
          messageId: message.id,
          venueId,
          authorId: user.id,
          question,
          closesAt,
          options: { createMany: { data: options.map((text, position) => ({ text, position })) } },
        },
      });
      return tx.message.findUniqueOrThrow({ where: { id: message.id }, include: MESSAGE_INCLUDE });
    });
    if (decision.severity > 0) {
      await this.enforcement.recordViolation(user.id, { messageId: created.id, severity: Math.max(1, decision.severity), categories: decision.categories });
    }
    await this.messages.publish(user.id, created);
    return this.withMyVote(this.messages.toSendResult(created, decision), created.poll?.id, user.id);
  }

  /** One vote per member; voting again moves it. Voters must be present in the chat. */
  async vote(user: UserSnapshot, pollId: string, optionId: string): Promise<{ poll: ChatPollView }> {
    const poll = await this.visiblePoll(pollId, user.id);
    if (!(await this.presence.isEligibleToPost(user.id, poll.venueId))) throw forbidden('NOT_MEMBER', 'Join the chat to vote.');
    if (isPollClosed(poll)) throw conflict('POLL_CLOSED', 'This poll is closed.');
    if (!poll.options.some((o) => o.id === optionId)) throw badRequest('INVALID_OPTION', 'That option does not belong to this poll.');
    await this.prisma.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: user.id } },
      create: { pollId, userId: user.id, optionId },
      update: { optionId },
    });
    this.scheduleBroadcast(pollId);
    return { poll: toPollView(await this.load(pollId), optionId) };
  }

  /** The author, or a moderator, ends the poll; results stay visible. */
  async close(user: UserSnapshot, pollId: string): Promise<{ poll: ChatPollView }> {
    const poll = await this.visiblePoll(pollId, user.id);
    if (poll.authorId !== user.id && user.role !== 'MODERATOR' && user.role !== 'ADMIN') throw forbidden('FORBIDDEN', 'Only the person who started the poll can close it.');
    if (isPollClosed(poll)) throw conflict('POLL_CLOSED', 'This poll is already closed.');
    await this.prisma.poll.update({ where: { id: pollId }, data: { closed: true } });
    await this.broadcast(pollId);
    const mine = await this.prisma.pollVote.findUnique({ where: { pollId_userId: { pollId, userId: user.id } } });
    return { poll: toPollView(await this.load(pollId), mine?.optionId ?? null) };
  }

  private async load(pollId: string): Promise<PollRow> {
    return this.prisma.poll.findUniqueOrThrow({ where: { id: pollId }, include: POLL_INCLUDE });
  }

  /** A poll whose message is still visible and whose author the viewer has not blocked. */
  private async visiblePoll(pollId: string, viewerId: string): Promise<PollRow & { message: { status: string } }> {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId }, include: { ...POLL_INCLUDE, message: { select: { status: true } } } });
    if (!poll || !['APPROVED', 'CENSORED'].includes(poll.message.status)) throw notFound('This poll is no longer available.');
    if ((await this.blocks.blockset(viewerId)).includes(poll.authorId)) throw notFound('This poll is no longer available.');
    return poll;
  }

  private async withMyVote(result: SendResult, pollId: string | undefined, userId: string): Promise<SendResult> {
    if (!result.message?.poll || !pollId) return result;
    const mine = await this.prisma.pollVote.findUnique({ where: { pollId_userId: { pollId, userId } } });
    result.message.poll.myOptionId = mine?.optionId ?? null;
    return result;
  }

  private scheduleBroadcast(pollId: string): void {
    if (this.timers.has(pollId)) return;
    this.timers.set(
      pollId,
      setTimeout(() => {
        this.timers.delete(pollId);
        void this.broadcast(pollId).catch(() => undefined);
      }, BROADCAST_DEBOUNCE_MS),
    );
  }

  private async broadcast(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId }, include: { ...POLL_INCLUDE, message: { select: { status: true } } } });
    if (!poll || !['APPROVED', 'CENSORED'].includes(poll.message.status)) return;
    const excluded = await this.blocks.blockset(poll.authorId);
    this.bus.toVenue(poll.venueId, { type: 'poll_update', venueId: poll.venueId, messageId: poll.messageId, poll: toPollView(poll) }, excluded);
  }
}
