/** Balances a wallet holds, in whole units. */
export interface WalletBalances {
  sol: number;
  usdc: number;
  skr: number;
}

/**
 * Everything Larea does on Solana, behind one interface so tests use an in-memory fake
 * (the STRIPE_CLIENT pattern). Transactions for the user's wallet are built here, partially signed by
 * Larea's keys where needed, and returned serialized for Mobile Wallet Adapter to sign and send.
 */
export interface SolanaClient {
  readonly cluster: 'localnet' | 'devnet' | 'mainnet';
  balances(address: string): Promise<WalletBalances>;
}

export const SOLANA_CLIENT = Symbol('SOLANA_CLIENT');

/** Solana is not configured on this server. */
export class SolanaUnavailableError extends Error {}
