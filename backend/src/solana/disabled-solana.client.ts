import type { Confirmation, PreparedTransaction, SolanaClient, WalletBalances } from './solana.client.js';
import { SolanaUnavailableError } from './solana.client.js';

const off = <T>(): Promise<T> => Promise.reject(new SolanaUnavailableError('Solana is not configured on this server'));

/** Used when Solana is switched off or not configured: every call explains itself. */
export class DisabledSolanaClient implements SolanaClient {
  readonly cluster = 'devnet' as const;
  balances = (): Promise<WalletBalances> => off();
  buildStampMint = (): Promise<PreparedTransaction> => off();
  buildTransfer = (): Promise<PreparedTransaction> => off();
  custodyAddress = (): string | null => null;
  sendFromCustody = (): Promise<string> => off();
  submit = (): Promise<string> => off();
  confirm = (): Promise<Confirmation> => off();
  assetsByOwner = (): Promise<string[] | null> => Promise.resolve(null);
  sendStarterFunds = (): Promise<string | null> => Promise.resolve(null);
}
