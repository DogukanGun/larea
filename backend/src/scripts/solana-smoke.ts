/**
 * End-to-end check of RealSolanaClient against the configured cluster (local validator or devnet):
 * a throwaway wallet funded by the authority mints a stamp with a level badge, then tips a second
 * wallet 1.5 test USDC. Usage: node dist/scripts/solana-smoke.js
 */
import { generateSigner, signTransaction, sol } from '@metaplex-foundation/umi';
import { createAssociatedToken, fetchToken, findAssociatedTokenPda, mintTokensTo, transferSol } from '@metaplex-foundation/mpl-toolbox';
import { publicKey } from '@metaplex-foundation/umi';
import { type Env, loadDotEnvIfPresent } from '../config/env.js';
import { createLareaUmi, keypairFromSecret } from '../solana/chain.js';
import { RealSolanaClient } from '../solana/real-solana.client.js';

loadDotEnvIfPresent();
// Only the Solana settings matter here.
const e = process.env;
const env = {
  PUBLIC_URL: e.PUBLIC_URL ?? 'http://localhost:3000',
  SOLANA_CLUSTER: (e.SOLANA_CLUSTER ?? 'localnet') as Env['SOLANA_CLUSTER'],
  SOLANA_RPC_URL: e.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
  SOLANA_DAS_URL: e.SOLANA_DAS_URL,
  SOLANA_AUTHORITY_SECRET: e.SOLANA_AUTHORITY_SECRET,
  SOLANA_STAMP_TREE: e.SOLANA_STAMP_TREE,
  SOLANA_STAMP_COLLECTION: e.SOLANA_STAMP_COLLECTION,
  SOLANA_LEVEL_COLLECTION: e.SOLANA_LEVEL_COLLECTION,
  USDC_MINT: e.USDC_MINT,
  SKR_MINT: e.SKR_MINT,
};
if (!env.SOLANA_AUTHORITY_SECRET || !env.SOLANA_STAMP_TREE) {
  console.error('run solana:setup first');
  process.exit(2);
}
const client = new RealSolanaClient(env);
const probe = createLareaUmi(env.SOLANA_RPC_URL);
const umi = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_AUTHORITY_SECRET!));
const user = generateSigner(umi);
await transferSol(umi, { destination: user.publicKey, amount: sol(0.05) }).sendAndConfirm(umi);

const prepared = await client.buildStampMint({
  owner: user.publicKey.toString(),
  name: 'Smoke Test · 1',
  uri: `${env.PUBLIC_URL}/solana/metadata/stamps/smoke.json`,
  levelBadge: { name: 'Regular', uri: `${env.PUBLIC_URL}/solana/metadata/levels/2.json` },
});
async function signSubmitConfirm(label: string, transaction: string, messageHash: string) {
  const tx = umi.transactions.deserialize(Buffer.from(transaction, 'base64'));
  const signed = await signTransaction(tx, [user]);
  const signature = await client.submit(Buffer.from(umi.transactions.serialize(signed)).toString('base64'), messageHash);
  for (let i = 0; i < 30; i++) {
    const result = await client.confirm(signature, messageHash);
    if (result.state === 'failed') throw new Error(`${label} failed: ${result.error}`);
    if (result.state === 'confirmed') {
      console.log(label, signature, JSON.stringify(result.minted));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not confirmed in 30 s`);
}

await signSubmitConfirm('stamp', prepared.transaction, prepared.messageHash);

// Tip: give the user test USDC (the authority holds the mint), then send 1.5 to a fresh wallet.
const usdc = publicKey(env.USDC_MINT!);
await createAssociatedToken(umi, { mint: usdc, owner: user.publicKey }).sendAndConfirm(umi);
await mintTokensTo(umi, { mint: usdc, token: findAssociatedTokenPda(umi, { mint: usdc, owner: user.publicKey })[0], amount: 10_000_000n }).sendAndConfirm(umi);
const friend = generateSigner(umi);
const tip = await client.buildTransfer({ from: user.publicKey.toString(), to: friend.publicKey.toString(), token: 'USDC', amount: 1_500_000n, memo: 'larea:tip:smoke' });
await signSubmitConfirm('tip', tip.transaction, tip.messageHash);
const received = await fetchToken(umi, findAssociatedTokenPda(umi, { mint: usdc, owner: friend.publicKey })[0]);
console.log('friend received', Number(received.amount) / 1e6, 'USDC');
process.exit(received.amount === 1_500_000n ? 0 : 1);
