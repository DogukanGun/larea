import { fetchToken, findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { publicKey, type Umi } from '@metaplex-foundation/umi';
import type { Env } from '../config/env.js';
import { createLareaUmi, keypairFromSecret, TOKEN_DECIMALS } from './chain.js';
import type { SolanaClient, WalletBalances } from './solana.client.js';

type SolanaEnv = Pick<Env, 'SOLANA_CLUSTER' | 'SOLANA_RPC_URL' | 'SOLANA_AUTHORITY_SECRET' | 'USDC_MINT' | 'SKR_MINT'>;

/** Talks to a real cluster (local validator, devnet or mainnet) through umi. */
export class RealSolanaClient implements SolanaClient {
  readonly cluster: SolanaClient['cluster'];
  private readonly umi: Umi;

  constructor(private readonly env: SolanaEnv) {
    this.cluster = env.SOLANA_CLUSTER;
    const probe = createLareaUmi(env.SOLANA_RPC_URL);
    this.umi = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_AUTHORITY_SECRET!));
  }

  private async tokenBalance(owner: string, mint: string | undefined): Promise<number> {
    if (!mint) return 0;
    const [ata] = findAssociatedTokenPda(this.umi, { mint: publicKey(mint), owner: publicKey(owner) });
    const token = await fetchToken(this.umi, ata).catch(() => null);
    return token ? Number(token.amount) / 10 ** TOKEN_DECIMALS : 0;
  }

  async balances(address: string): Promise<WalletBalances> {
    const [lamports, usdc, skr] = await Promise.all([
      this.umi.rpc.getBalance(publicKey(address)),
      this.tokenBalance(address, this.env.USDC_MINT),
      this.tokenBalance(address, this.env.SKR_MINT),
    ]);
    return { sol: Number(lamports.basisPoints) / 1e9, usdc, skr };
  }
}
