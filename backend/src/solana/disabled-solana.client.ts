import { type SolanaClient, SolanaUnavailableError, type WalletBalances } from './solana.client.js';

/** Used when Solana is switched off or not configured: every call explains itself. */
export class DisabledSolanaClient implements SolanaClient {
  readonly cluster = 'devnet' as const;

  balances(): Promise<WalletBalances> {
    return Promise.reject(new SolanaUnavailableError('Solana is not configured on this server'));
  }
}
