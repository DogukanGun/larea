/**
 * Mints one real check-in stamp through RealSolanaClient against the configured cluster: a throwaway
 * wallet (funded by the authority on localnet) signs the prepared transaction, Larea submits it and
 * reads back the asset. Usage: node dist/scripts/solana-smoke-stamp.js
 */
import { generateSigner, signTransaction, sol } from '@metaplex-foundation/umi';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';
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
const tx = umi.transactions.deserialize(Buffer.from(prepared.transaction, 'base64'));
const signed = await signTransaction(tx, [user]);
const signature = await client.submit(Buffer.from(umi.transactions.serialize(signed)).toString('base64'), prepared.messageHash);
console.log('signature', signature);
for (let i = 0; i < 30; i++) {
  const result = await client.confirm(signature, prepared.messageHash);
  if (result.state !== 'pending') {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.state === 'confirmed' ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error('not confirmed in 30 s');
process.exit(1);
