import { createHash, randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import {
  type Confirmation,
  type CustodyTransferInput,
  type CustodyWallet,
  type PreparedTransaction,
  type SolanaClient,
  type StampMintInput,
  type StarterFunds,
  TransactionMismatchError,
  type TransferInput,
  type WalletBalances,
} from '../solana/solana.client.js';

/** A transfer as JSON: the amount in base units as a string. */
export type PlainTransfer = Omit<TransferInput, 'amount'> & { amount: string };

type FakeTx = { kind: 'stamp'; input: StampMintInput; nonce: string } | { kind: 'transfer'; input: PlainTransfer; nonce: string };

/**
 * In-memory Solana for tests. A "transaction" is base64 JSON; the test plays the wallet with
 * `sign()` (or tampers with it) and decides whether sent transactions land (`landNext`).
 */
export class FakeSolanaClient implements SolanaClient {
  readonly cluster = 'localnet' as const;
  readonly wallets = new Map<string, WalletBalances>();
  /** Assets a DAS indexer would report per owner; unset = no DAS configured. */
  das: Map<string, string[]> | null = null;
  private readonly sent = new Map<string, { tx: FakeTx; hash: string; outcome: 'confirmed' | 'failed' | 'pending' }>();
  private leafCounter = 0;
  /** What the next submitted/sent transaction does. */
  landNext: 'confirmed' | 'failed' | 'pending' = 'confirmed';

  balances(address: string): Promise<WalletBalances> {
    return Promise.resolve(this.wallets.get(address) ?? { sol: 0, usdc: 0, skr: 0 });
  }

  private prepare(tx: FakeTx): PreparedTransaction {
    const body = JSON.stringify(tx);
    return { transaction: Buffer.from(body).toString('base64'), messageHash: createHash('sha256').update(body).digest('hex') };
  }

  buildStampMint(input: StampMintInput): Promise<PreparedTransaction> {
    return Promise.resolve(this.prepare({ kind: 'stamp', input, nonce: randomBytes(4).toString('hex') }));
  }

  /** Transfers Larea sent from its custody wallets, in order. */
  readonly custodySent: (Omit<CustodyTransferInput, 'amount'> & { amount: string; signature: string })[] = [];
  /** Makes the next custody transfer fail (an empty escrow, an RPC outage). */
  failCustody = false;

  custodyAddress(wallet: CustodyWallet): string {
    return wallet === 'escrow' ? 'EscrowXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' : 'RewardsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  }

  sendFromCustody(input: CustodyTransferInput): Promise<string> {
    if (this.failCustody) {
      this.failCustody = false;
      return Promise.reject(new Error('custody transfer failed'));
    }
    const signature = bs58.encode(randomBytes(64));
    this.custodySent.push({ ...input, amount: input.amount.toString(), signature });
    return Promise.resolve(signature);
  }

  /** Transfers the tests built, in order (amounts as strings). */
  readonly transfers: PlainTransfer[] = [];

  buildTransfer(input: TransferInput): Promise<PreparedTransaction> {
    const plain: PlainTransfer = { ...input, amount: input.amount.toString() };
    this.transfers.push(plain);
    return Promise.resolve(this.prepare({ kind: 'transfer', input: plain, nonce: randomBytes(4).toString('hex') }));
  }

  /** What the wallet does: here, signing leaves the bytes unchanged. */
  sign(transaction: string): string {
    return transaction;
  }

  /** The wallet sent it itself (MWA signAndSend): returns the signature the app reports. */
  sendFromWallet(transaction: string): string {
    const body = Buffer.from(transaction, 'base64').toString();
    const signature = bs58.encode(randomBytes(64));
    this.sent.set(signature, { tx: JSON.parse(body) as FakeTx, hash: createHash('sha256').update(body).digest('hex'), outcome: this.landNext });
    return signature;
  }

  submit(signedTransaction: string, expectedMessageHash: string): Promise<string> {
    const body = Buffer.from(signedTransaction, 'base64').toString();
    if (createHash('sha256').update(body).digest('hex') !== expectedMessageHash) {
      return Promise.reject(new TransactionMismatchError('the signed transaction was changed'));
    }
    return Promise.resolve(this.sendFromWallet(signedTransaction));
  }

  confirm(signature: string, expectedMessageHash: string): Promise<Confirmation> {
    const sent = this.sent.get(signature);
    if (!sent || sent.outcome === 'pending') return Promise.resolve({ state: 'pending' });
    if (sent.outcome === 'failed') return Promise.resolve({ state: 'failed', error: 'simulated failure' });
    if (sent.hash !== expectedMessageHash) return Promise.resolve({ state: 'failed', error: 'transaction does not match the prepared one' });
    if (sent.tx.kind === 'transfer') return Promise.resolve({ state: 'confirmed', minted: [] });
    const owner = sent.tx.input.owner;
    const minted = [sent.tx.input.name, ...(sent.tx.input.levelBadge ? [sent.tx.input.levelBadge.name] : [])].map(() => {
      const leafIndex = this.leafCounter++;
      return { assetId: bs58.encode(createHash('sha256').update(`leaf:${leafIndex}:${signature}`).digest()), leafIndex, owner };
    });
    return Promise.resolve({ state: 'confirmed', minted });
  }

  /** Marks a sent transaction as landed later (for sweeper tests). */
  land(signature: string): void {
    const sent = this.sent.get(signature);
    if (sent) sent.outcome = 'confirmed';
  }

  assetsByOwner(owner: string): Promise<string[] | null> {
    return Promise.resolve(this.das ? (this.das.get(owner) ?? []) : null);
  }

  /** Starter funds handed out, in order. */
  readonly starterSent: { to: string; sol: number; usdc: string; skr: string }[] = [];
  /** Makes the next starter transfer fail (an empty authority wallet, an RPC outage). */
  failStarter = false;

  sendStarterFunds(to: string, funds: StarterFunds): Promise<string | null> {
    if (this.failStarter) {
      this.failStarter = false;
      return Promise.reject(new Error('starter funds failed'));
    }
    const current = this.wallets.get(to) ?? { sol: 0, usdc: 0, skr: 0 };
    this.wallets.set(to, { sol: current.sol + funds.sol, usdc: current.usdc + Number(funds.usdc) / 1e6, skr: current.skr + Number(funds.skr) / 1e6 });
    this.starterSent.push({ to, sol: funds.sol, usdc: funds.usdc.toString(), skr: funds.skr.toString() });
    return Promise.resolve(bs58.encode(randomBytes(64)));
  }
}
