import { createHash } from 'node:crypto';
import { dasApi, type DasApiInterface } from '@metaplex-foundation/digital-asset-standard-api';
import { getLeafSchemaSerializer, MPL_BUBBLEGUM_PROGRAM_ID, mintV2 } from '@metaplex-foundation/mpl-bubblegum';
import { addMemo, createIdempotentAssociatedToken, fetchToken, findAssociatedTokenPda, transferTokensChecked } from '@metaplex-foundation/mpl-toolbox';
import { createNoopSigner, publicKey, signTransaction, type TransactionBuilder, transactionBuilder, type Umi } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import bs58 from 'bs58';
import type { Env } from '../config/env.js';
import { createLareaUmi, keypairFromSecret, TOKEN_DECIMALS } from './chain.js';
import {
  type Confirmation,
  type CustodyTransferInput,
  type CustodyWallet,
  type MintedAsset,
  type PreparedTransaction,
  type SolanaClient,
  SolanaUnavailableError,
  type StampMintInput,
  TransactionMismatchError,
  type TransferInput,
  type WalletBalances,
} from './solana.client.js';

type SolanaEnv = Pick<
  Env,
  | 'SOLANA_CLUSTER'
  | 'SOLANA_RPC_URL'
  | 'SOLANA_DAS_URL'
  | 'SOLANA_AUTHORITY_SECRET'
  | 'SOLANA_ESCROW_SECRET'
  | 'SOLANA_REWARDS_SECRET'
  | 'SOLANA_STAMP_TREE'
  | 'SOLANA_STAMP_COLLECTION'
  | 'SOLANA_LEVEL_COLLECTION'
  | 'USDC_MINT'
  | 'SKR_MINT'
>;

const hashMessage = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Talks to a real cluster (local validator, devnet or mainnet) through umi. */
export class RealSolanaClient implements SolanaClient {
  readonly cluster: SolanaClient['cluster'];
  private readonly umi: Umi;
  private readonly das: (Umi & { rpc: DasApiInterface }) | null;
  /** One umi per custody wallet, with that wallet as identity and fee payer. */
  private readonly custody: Partial<Record<CustodyWallet, Umi>> = {};

  constructor(private readonly env: SolanaEnv) {
    this.cluster = env.SOLANA_CLUSTER;
    const probe = createLareaUmi(env.SOLANA_RPC_URL);
    this.umi = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_AUTHORITY_SECRET!));
    if (env.SOLANA_ESCROW_SECRET) this.custody.escrow = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_ESCROW_SECRET));
    if (env.SOLANA_REWARDS_SECRET) this.custody.rewards = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_REWARDS_SECRET));
    this.das = env.SOLANA_DAS_URL ? (createUmi(env.SOLANA_DAS_URL).use(dasApi()) as Umi & { rpc: DasApiInterface }) : null;
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

  /** Signs as Larea (tree and collection authority) and leaves the fee payer's signature to the wallet. */
  private async prepare(builder: TransactionBuilder): Promise<PreparedTransaction> {
    const built = await builder.buildWithLatestBlockhash(this.umi);
    const signed = await signTransaction(built, [this.umi.identity]);
    return {
      transaction: Buffer.from(this.umi.transactions.serialize(signed)).toString('base64'),
      messageHash: hashMessage(signed.serializedMessage),
    };
  }

  async buildStampMint(input: StampMintInput): Promise<PreparedTransaction> {
    const payer = createNoopSigner(publicKey(input.owner));
    const mint = (collection: string, name: string, uri: string) =>
      mintV2(this.umi, {
        payer,
        treeCreatorOrDelegate: this.umi.identity,
        collectionAuthority: this.umi.identity,
        leafOwner: publicKey(input.owner),
        merkleTree: publicKey(this.env.SOLANA_STAMP_TREE!),
        coreCollection: publicKey(collection),
        metadata: { name, uri, creators: [], sellerFeeBasisPoints: 0, collection: publicKey(collection) },
      });
    let builder = mint(this.env.SOLANA_STAMP_COLLECTION!, input.name, input.uri);
    if (input.levelBadge) builder = builder.add(mint(this.env.SOLANA_LEVEL_COLLECTION!, input.levelBadge.name, input.levelBadge.uri));
    return this.prepare(builder.setFeePayer(payer));
  }

  async buildTransfer(input: TransferInput): Promise<PreparedTransaction> {
    const payer = createNoopSigner(publicKey(input.from));
    const mint = this.mintOf(input.token);
    const [source] = findAssociatedTokenPda(this.umi, { mint, owner: payer.publicKey });
    const [destination] = findAssociatedTokenPda(this.umi, { mint, owner: publicKey(input.to) });
    // Larea co-signs the memo. A transaction that already carries someone else's signature is left
    // exactly as built by wallets (some add their own priority-fee instructions to transactions they
    // sign alone), so what lands is what Larea prepared and checked.
    return this.prepare(
      transactionBuilder()
        .add(createIdempotentAssociatedToken(this.umi, { payer, ata: destination, owner: publicKey(input.to), mint }))
        .add(transferTokensChecked(this.umi, { source, mint, destination, authority: payer, amount: input.amount, decimals: TOKEN_DECIMALS }))
        .add(addMemo(this.umi, { memo: input.memo }).addRemainingAccounts({ signer: this.umi.identity, isWritable: false }))
        .setFeePayer(payer),
    );
  }

  custodyAddress(wallet: CustodyWallet): string | null {
    return this.custody[wallet]?.identity.publicKey.toString() ?? null;
  }

  private mintOf(token: TransferInput['token']) {
    return publicKey(token === 'USDC' ? this.env.USDC_MINT! : this.env.SKR_MINT!);
  }

  async sendFromCustody(input: CustodyTransferInput): Promise<string> {
    const umi = this.custody[input.wallet];
    if (!umi) throw new SolanaUnavailableError(`the ${input.wallet} wallet is not configured`);
    const mint = this.mintOf(input.token);
    const to = publicKey(input.to);
    const [source] = findAssociatedTokenPda(umi, { mint, owner: umi.identity.publicKey });
    const [destination] = findAssociatedTokenPda(umi, { mint, owner: to });
    const result = await transactionBuilder()
      .add(createIdempotentAssociatedToken(umi, { ata: destination, owner: to, mint }))
      .add(transferTokensChecked(umi, { source, mint, destination, amount: input.amount, decimals: TOKEN_DECIMALS }))
      .add(addMemo(umi, { memo: input.memo }))
      .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    if (result.result.value.err) throw new Error(`custody transfer failed: ${JSON.stringify(result.result.value.err)}`);
    return bs58.encode(result.signature);
  }

  async submit(signedTransaction: string, expectedMessageHash: string): Promise<string> {
    const tx = this.umi.transactions.deserialize(Buffer.from(signedTransaction, 'base64'));
    if (hashMessage(tx.serializedMessage) !== expectedMessageHash) throw new TransactionMismatchError('the signed transaction was changed');
    const signature = await this.umi.rpc.sendTransaction(tx, { skipPreflight: false, commitment: 'confirmed' });
    return bs58.encode(signature);
  }

  async confirm(signature: string, expectedMessageHash: string): Promise<Confirmation> {
    const sig = bs58.decode(signature);
    const [status] = await this.umi.rpc.getSignatureStatuses([sig]);
    if (!status) return { state: 'pending' };
    if (status.error) return { state: 'failed', error: JSON.stringify(status.error) };
    if (status.commitment === 'processed') return { state: 'pending' };
    const tx = await this.umi.rpc.getTransaction(sig, { commitment: 'confirmed' });
    if (!tx) return { state: 'pending' };
    if (hashMessage(this.umi.transactions.serializeMessage(tx.message)) !== expectedMessageHash) {
      return { state: 'failed', error: 'transaction does not match the prepared one' };
    }
    // Each mintV2 logs its leaf through the noop program: inner instruction 1 when minting into a Core
    // collection (0 would be the collection update). Stamp first, then the optional level badge.
    const minted: MintedAsset[] = [];
    tx.message.instructions.forEach((ix, index) => {
      if (tx.message.accounts[ix.programIndex].toString() !== MPL_BUBBLEGUM_PROGRAM_ID) return;
      const collection = tx.message.accounts[ix.accountIndexes[7]]?.toString();
      const inner = tx.meta.innerInstructions?.find((group) => group.index === index);
      const logged = inner?.instructions[collection === MPL_BUBBLEGUM_PROGRAM_ID ? 0 : 1];
      if (!logged) return;
      const [leaf] = getLeafSchemaSerializer().deserialize(logged.data.slice(8));
      minted.push({ assetId: leaf.id.toString(), leafIndex: Number(leaf.nonce), owner: leaf.owner.toString() });
    });
    return { state: 'confirmed', minted };
  }

  async assetsByOwner(owner: string): Promise<string[] | null> {
    if (!this.das) return null;
    const page = await this.das.rpc.getAssetsByOwner({ owner: publicKey(owner), limit: 1000 });
    return page.items.map((asset) => asset.id.toString());
  }
}
