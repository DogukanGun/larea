import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlocksService } from '../blocks/blocks.service.js';
import { badRequest, conflict, forbidden, notFound, unavailable } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { Prisma, type Tip, type TipToken } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { MESSAGE_INCLUDE, MessagesService } from '../messages/messages.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError, TransactionMismatchError } from './solana.client.js';
import { formatUnits, parseUnits } from './units.js';

/** Per tip, in whole tokens. */
const MIN_TIP = parseUnits('0.01')!;
const MAX_TIP = parseUnits('1000')!;

export interface TipView {
  id: string;
  venueId: string;
  token: TipToken;
  amount: string;
  to: { id: string; displayName: string };
  status: Tip['status'];
  signature: string | null;
  error: string | null;
  /** The chat message announcing it, once confirmed. */
  messageId: string | null;
  createdAt: string;
}

export interface TipResult {
  tip: TipView;
  /** Base64 transaction for the sender's wallet to sign (it is the only signer). */
  transaction: string;
  cluster: SolanaClient['cluster'];
}

type TipRow = Tip & { to: { id: string; displayName: string } };
const TIP_INCLUDE = { to: { select: { id: true, displayName: true } } } as const;

/**
 * Tips in the chat: a USDC or SKR transfer from wallet to wallet. Larea builds it (creating the
 * recipient's token account when needed, with a `larea:tip:<id>` memo), the sender's wallet signs,
 * and once it lands a TIP message announces it in the place's main chat.
 */
@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly blocks: BlocksService,
    private readonly messages: MessagesService,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  private chainCall<T>(call: Promise<T>): Promise<T> {
    return call.catch((error: unknown) => {
      if (error instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now.');
      throw error;
    });
  }

  async create(user: UserSnapshot, venueId: string, input: { toUserId: string; token: TipToken; amount: string }, now = new Date()): Promise<TipResult> {
    const amount = parseUnits(input.amount);
    if (amount === null || amount < MIN_TIP || amount > MAX_TIP) {
      throw badRequest('VALIDATION', `Tips go from ${formatUnits(MIN_TIP)} to ${formatUnits(MAX_TIP)} ${input.token}.`);
    }
    if (input.toUserId === user.id) throw badRequest('VALIDATION', "You can't tip yourself.");
    if (!(await this.presence.findActive(user.id, venueId))) throw forbidden('NOT_MEMBER', 'Join the chat to tip people here.');
    const [from, to] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId: user.id } }),
      this.prisma.wallet.findUnique({ where: { userId: input.toUserId }, include: { user: { select: { id: true, deletedAt: true } } } }),
    ]);
    if (!from) throw conflict('WALLET_REQUIRED', 'Connect a wallet in your profile to send tips.');
    if (!to || to.user.deletedAt) throw conflict('RECIPIENT_NO_WALLET', "This person hasn't connected a wallet, so they can't receive tips yet.");
    if ((await this.blocks.blockset(user.id)).includes(input.toUserId)) throw forbidden('BLOCKED', "You can't tip this person.");
    // Only people who are part of this chat: here now, or who have written here.
    const known =
      (await this.presence.findActive(input.toUserId, venueId)) ??
      (await this.prisma.message.findFirst({ where: { venueId, authorId: input.toUserId, status: { in: ['APPROVED', 'CENSORED'] } }, select: { id: true } }));
    if (!known) throw notFound('This person is not in this chat.');

    const tip = await this.prisma.tip.create({
      data: {
        venueId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        fromWallet: from.address,
        toWallet: to.address,
        token: input.token,
        amount,
        messageHash: 'pending',
        expiresAt: new Date(now.getTime() + this.env.SOLANA_PENDING_TTL_SEC * 1000),
      },
      include: TIP_INCLUDE,
    });
    try {
      const prepared = await this.chainCall(
        this.solana.buildTransfer({ from: from.address, to: to.address, token: input.token, amount, memo: `larea:tip:${tip.id}` }),
      );
      const updated = await this.prisma.tip.update({ where: { id: tip.id }, data: { messageHash: prepared.messageHash }, include: TIP_INCLUDE });
      return { tip: this.view(updated), transaction: prepared.transaction, cluster: this.solana.cluster };
    } catch (error) {
      await this.prisma.tip.update({ where: { id: tip.id }, data: { status: 'FAILED', error: 'could not build' } });
      throw error;
    }
  }

  private async own(userId: string, tipId: string): Promise<TipRow> {
    const tip = await this.prisma.tip.findFirst({ where: { id: tipId, fromUserId: userId }, include: TIP_INCLUDE });
    if (!tip) throw notFound('This tip does not exist.');
    return tip;
  }

  async submit(userId: string, tipId: string, signedTransaction: string): Promise<TipView> {
    const tip = await this.own(userId, tipId);
    if (tip.status !== 'PENDING') return this.view(tip);
    if (tip.signature) return this.settle(tip);
    if (tip.expiresAt <= new Date()) throw badRequest('TIP_EXPIRED', 'This tip expired. Please try again.');
    const signature = await this.chainCall(this.solana.submit(signedTransaction, tip.messageHash)).catch((error: unknown) => {
      if (error instanceof TransactionMismatchError) throw badRequest('TRANSACTION_MISMATCH', 'The signed transaction is not the one Larea prepared.');
      throw error;
    });
    return this.settle(await this.withSignature(tip, signature));
  }

  async confirm(userId: string, tipId: string, signature: string): Promise<TipView> {
    const tip = await this.own(userId, tipId);
    if (tip.status !== 'PENDING') return this.view(tip);
    if (tip.signature && tip.signature !== signature) throw conflict('SIGNATURE_MISMATCH', 'This tip already has a different transaction.');
    return this.settle(tip.signature ? tip : await this.withSignature(tip, signature));
  }

  private async withSignature(tip: TipRow, signature: string): Promise<TipRow> {
    try {
      return await this.prisma.tip.update({ where: { id: tip.id }, data: { signature }, include: TIP_INCLUDE });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('SIGNATURE_USED', 'This transaction belongs to another payment.');
      throw error;
    }
  }

  private async settle(tip: TipRow, now = new Date()): Promise<TipView> {
    if (!tip.signature) return this.view(tip);
    const result = await this.chainCall(this.solana.confirm(tip.signature, tip.messageHash)).catch((error: unknown) => {
      if (error instanceof Error && !(error instanceof SolanaUnavailableError)) {
        this.logger.warn({ err: error, tipId: tip.id }, 'confirm failed; will retry');
        return { state: 'pending' as const };
      }
      throw error;
    });
    if (result.state === 'pending') {
      if (tip.expiresAt.getTime() + 120_000 < now.getTime()) return this.fail(tip, 'not confirmed in time');
      return this.view(tip);
    }
    if (result.state === 'failed') return this.fail(tip, result.error);

    // Confirm once, even if the app and the sweeper both get here.
    const claimed = await this.prisma.tip.updateMany({ where: { id: tip.id, status: 'PENDING' }, data: { status: 'CONFIRMED', confirmedAt: now, error: null } });
    if (claimed.count === 0) return this.view(await this.prisma.tip.findUniqueOrThrow({ where: { id: tip.id }, include: TIP_INCLUDE }));
    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: tip.fromUserId }, select: { displayName: true } });
    const message = await this.prisma.message.create({
      data: {
        venueId: tip.venueId,
        authorId: tip.fromUserId,
        kind: 'TIP',
        text: `${sender.displayName} tipped ${tip.to.displayName} ${formatUnits(tip.amount)} ${tip.token}`,
        status: 'APPROVED',
        clientKey: `tip-${tip.id}`,
        tip: { connect: { id: tip.id } },
      },
      include: MESSAGE_INCLUDE,
    });
    await this.messages.publish(tip.fromUserId, message);
    this.logger.log({ tipId: tip.id, token: tip.token, amount: formatUnits(tip.amount) }, 'tip confirmed');
    return this.view(await this.prisma.tip.findUniqueOrThrow({ where: { id: tip.id }, include: TIP_INCLUDE }));
  }

  private async fail(tip: TipRow, error: string): Promise<TipView> {
    const updated = await this.prisma.tip.update({ where: { id: tip.id }, data: { status: 'FAILED', error: error.slice(0, 500) }, include: TIP_INCLUDE });
    return this.view(updated);
  }

  async sweep(now = new Date()): Promise<{ confirmed: number; failed: number }> {
    const pending = await this.prisma.tip.findMany({
      where: { status: 'PENDING', OR: [{ signature: { not: null } }, { expiresAt: { lte: now } }] },
      include: TIP_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let confirmed = 0;
    let failed = 0;
    for (const tip of pending) {
      const view = tip.signature
        ? await this.settle(tip, now).catch((error: unknown) => {
            this.logger.warn({ err: error, tipId: tip.id }, 'sweep confirm failed');
            return null;
          })
        : await this.fail(tip, 'expired before signing');
      if (view?.status === 'CONFIRMED') confirmed++;
      if (view?.status === 'FAILED') failed++;
    }
    return { confirmed, failed };
  }

  view(tip: TipRow): TipView {
    return {
      id: tip.id,
      venueId: tip.venueId,
      token: tip.token,
      amount: formatUnits(tip.amount),
      to: tip.to,
      status: tip.status,
      signature: tip.signature,
      error: tip.error,
      messageId: tip.messageId,
      createdAt: tip.createdAt.toISOString(),
    };
  }
}
