import type { SolanaClient, WalletBalances } from '../solana/solana.client.js';

/** In-memory Solana for tests: balances are whatever the test sets. */
export class FakeSolanaClient implements SolanaClient {
  readonly cluster = 'localnet' as const;
  readonly wallets = new Map<string, WalletBalances>();

  balances(address: string): Promise<WalletBalances> {
    return Promise.resolve(this.wallets.get(address) ?? { sol: 0, usdc: 0, skr: 0 });
  }
}
