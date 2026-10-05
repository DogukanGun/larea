/** Balances a wallet holds, in whole units. */
export interface WalletBalances {
  sol: number;
  usdc: number;
  skr: number;
}

/** A transaction Larea built for the user's wallet: base64 wire bytes, partially signed by Larea's keys. */
export interface PreparedTransaction {
  transaction: string;
  /** sha256 (hex) of the message bytes; the signed transaction must carry exactly this message. */
  messageHash: string;
}

/** A compressed NFT that landed: its asset id, leaf index and owner. */
export interface MintedAsset {
  assetId: string;
  leafIndex: number;
  owner: string;
}

export type Confirmation =
  | { state: 'pending' }
  | { state: 'failed'; error: string }
  | { state: 'confirmed'; minted: MintedAsset[] };

export interface StampMintInput {
  owner: string;
  name: string;
  uri: string;
  /** A level badge minted in the same transaction (loyalty levels, S3). */
  levelBadge?: { name: string; uri: string };
}

export type TokenSymbol = 'USDC' | 'SKR';

/** An SPL transfer paid for and signed by `from` (tips, and later market payments). */
export interface TransferInput {
  from: string;
  to: string;
  token: TokenSymbol;
  /** Base units (6 decimals). */
  amount: bigint;
  /** Written with the Memo program, e.g. `larea:tip:<id>`. */
  memo: string;
}

/** Larea's own hot wallets: escrow holds market payments, rewards pays out SKR. */
export type CustodyWallet = 'escrow' | 'rewards';

export interface CustodyTransferInput {
  wallet: CustodyWallet;
  to: string;
  token: TokenSymbol;
  /** Base units (6 decimals). */
  amount: bigint;
  memo: string;
}

/**
 * Everything Larea does on Solana, behind one interface so tests use an in-memory fake
 * (the STRIPE_CLIENT pattern). Transactions for the user's wallet are built here, partially signed by
 * Larea's keys where needed, and returned serialized for Mobile Wallet Adapter to sign.
 */
export interface SolanaClient {
  readonly cluster: 'localnet' | 'devnet' | 'mainnet';
  balances(address: string): Promise<WalletBalances>;
  /** A mint of a soulbound stamp (plus an optional level badge) with the user's wallet as fee payer. */
  buildStampMint(input: StampMintInput): Promise<PreparedTransaction>;
  /** An SPL transfer from `from` to `to`, creating the recipient's token account if needed; `from` pays the fee. */
  buildTransfer(input: TransferInput): Promise<PreparedTransaction>;
  /** The address of one of Larea's custody wallets; null when it is not configured. */
  custodyAddress(wallet: CustodyWallet): string | null;
  /** A transfer Larea signs and pays for from a custody wallet; resolves with the confirmed signature. */
  sendFromCustody(input: CustodyTransferInput): Promise<string>;
  /** Sends a transaction the wallet signed; refuses anything whose message differs from what we built. */
  submit(signedTransaction: string, expectedMessageHash: string): Promise<string>;
  /** Where a sent transaction stands; for mints, the assets it created (checked against the message hash). */
  confirm(signature: string, expectedMessageHash: string): Promise<Confirmation>;
  /** Compressed NFT ids the owner holds according to a DAS indexer; null when none is configured. */
  assetsByOwner(owner: string): Promise<string[] | null>;
  /**
   * Sends SOL from the authority and mints test USDC/SKR to `to` (the authority is the mint authority
   * of the test mints). Resolves with the signature, or null on mainnet, where there are no test funds.
   */
  sendStarterFunds(to: string, funds: StarterFunds): Promise<string | null>;
}

/** Test funds a freshly linked wallet receives on localnet/devnet so it can pay fees and try tips. */
export interface StarterFunds {
  sol: number;
  /** Base units (6 decimals). */
  usdc: bigint;
  skr: bigint;
}

export const SOLANA_CLIENT = Symbol('SOLANA_CLIENT');

/** Solana is not configured on this server. */
export class SolanaUnavailableError extends Error {}

/** A signed transaction does not match the one Larea prepared. */
export class TransactionMismatchError extends Error {}
