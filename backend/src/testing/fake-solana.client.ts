import { createHash, randomBytes } from 'node:crypto';
import bs58 from 'bs58';
import {
  type Confirmation,
  type PreparedTransaction,
  type SolanaClient,
  type StampMintInput,
  TransactionMismatchError,
  type WalletBalances,
} from '../solana/solana.client.js';

interface FakeTx {
  kind: 'stamp';
  input: StampMintInput;
  nonce: string;
}

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
}
