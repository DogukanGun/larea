import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { badRequest, conflict, notFound, unavailable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { type SiwsChallenge, SiwsError, verifySiws } from './siws.js';
import { SOLANA_CLIENT, type SolanaClient, SolanaUnavailableError, type WalletBalances } from './solana.client.js';

const NONCE_TTL_SEC = 300;

export interface WalletView {
  address: string;
  linkedAt: string;
  cluster: SolanaClient['cluster'];
}

/**
 * Links a Solana wallet to a Larea account: the app asks the wallet to sign a Sign In With Solana
 * message carrying our one-time nonce, and the signature proves the account controls the address.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(SOLANA_CLIENT) private readonly solana: SolanaClient,
  ) {}

  private nonceKey(userId: string): string {
    return `siws:nonce:${userId}`;
  }

  private get domain(): string {
    return new URL(this.env.PUBLIC_URL).host;
  }

  private chainId(): string {
    return this.solana.cluster === 'mainnet' ? 'solana:mainnet' : `solana:${this.solana.cluster === 'localnet' ? 'devnet' : this.solana.cluster}`;
  }

  async challenge(userId: string): Promise<SiwsChallenge> {
    const nonce = randomBytes(12).toString('hex');
    await this.redis.client.set(this.nonceKey(userId), nonce, 'EX', NONCE_TTL_SEC);
    return {
      domain: this.domain,
      statement: 'Link this wallet to your Larea account.',
      uri: this.env.PUBLIC_URL,
      version: '1',
      chainId: this.chainId(),
      nonce,
      issuedAt: new Date().toISOString(),
    };
  }

  async link(userId: string, input: { address: string; message: string; signature: string }): Promise<WalletView> {
    const nonce = await this.redis.client.getdel(this.nonceKey(userId));
    if (!nonce) throw badRequest('CHALLENGE_EXPIRED', 'The sign-in request expired. Please try again.');
    try {
      verifySiws({
        address: input.address,
        message: Buffer.from(input.message, 'base64'),
        signature: Buffer.from(input.signature, 'base64'),
        expected: { domain: this.domain, nonce },
      });
    } catch (error) {
      if (error instanceof SiwsError) throw badRequest('INVALID_SIGNATURE', `The wallet signature could not be verified (${error.message}).`);
      throw error;
    }
    const taken = await this.prisma.wallet.findUnique({ where: { address: input.address } });
    if (taken && taken.userId !== userId) throw conflict('WALLET_TAKEN', 'This wallet is already linked to another Larea account.');
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId, address: input.address },
      update: { address: input.address, linkedAt: new Date() },
    });
    this.logger.log({ userId, address: wallet.address }, 'wallet linked');
    return this.view(wallet);
  }

  async get(userId: string): Promise<{ wallet: WalletView | null; balances: WalletBalances | null }> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { wallet: null, balances: null };
    const balances = await this.solana.balances(wallet.address).catch((error) => {
      if (error instanceof SolanaUnavailableError) throw unavailable('SOLANA_UNAVAILABLE', 'Solana is not reachable right now.');
      this.logger.warn({ err: error, address: wallet.address }, 'balance lookup failed');
      return null;
    });
    return { wallet: this.view(wallet), balances };
  }

  /** The address a user receives tips and payouts on; throws when none is linked. */
  async addressOf(userId: string): Promise<string> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw notFound('This person has not linked a wallet.');
    return wallet.address;
  }

  async unlink(userId: string): Promise<void> {
    await this.prisma.wallet.deleteMany({ where: { userId } });
  }

  private view(wallet: { address: string; linkedAt: Date }): WalletView {
    return { address: wallet.address, linkedAt: wallet.linkedAt.toISOString(), cluster: this.solana.cluster };
  }
}
