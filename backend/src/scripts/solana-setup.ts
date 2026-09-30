import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { createTreeV2 } from '@metaplex-foundation/mpl-bubblegum';
import { createCollection } from '@metaplex-foundation/mpl-core';
import { createMintWithAssociatedToken, transferSol } from '@metaplex-foundation/mpl-toolbox';
import { generateSigner, publicKey, sol, type Keypair, type Umi } from '@metaplex-foundation/umi';
import { createLareaUmi, keypairFromSecret, secretOf, TOKEN_DECIMALS, toBaseUnits } from '../solana/chain.js';

/**
 * One-time Solana setup for a cluster (local test validator or devnet): keypairs, the two soulbound
 * collections (stamps, levels), the Bubblegum V2 tree, test USDC and SKR mints, SKR in the rewards
 * wallet. Writes the results into the env file; re-running keeps what already exists.
 *
 *   node dist/scripts/solana-setup.js --cluster localnet            # after scripts/solana-validator.sh
 *   node dist/scripts/solana-setup.js --cluster devnet --env-file .env
 */
const { values } = parseArgs({
  options: {
    cluster: { type: 'string', default: 'localnet' },
    rpc: { type: 'string' },
    'env-file': { type: 'string', default: '.env' },
    'metadata-url': { type: 'string' },
  },
});
const cluster = values.cluster as 'localnet' | 'devnet';
if (cluster !== 'localnet' && cluster !== 'devnet') {
  console.error('usage: solana-setup --cluster localnet|devnet [--rpc <url>] [--env-file .env] [--metadata-url <url>]');
  process.exit(2);
}
const rpc = values.rpc ?? (cluster === 'localnet' ? 'http://127.0.0.1:8899' : 'https://api.devnet.solana.com');
const envFile = values['env-file']!;
const existing: Record<string, string | undefined> = (() => {
  try {
    return parseEnv(readFileSync(envFile, 'utf8'));
  } catch {
    return {};
  }
})();
const updates: Record<string, string> = { SOLANA_ENABLED: '1', SOLANA_CLUSTER: cluster, SOLANA_RPC_URL: rpc };

const probe = createLareaUmi(rpc);
function keypair(key: string): Keypair {
  const secret = existing[key];
  const kp = secret ? keypairFromSecret(probe, secret) : probe.eddsa.generateKeypair();
  updates[key] = secretOf(kp);
  return kp;
}
const authority = keypair('SOLANA_AUTHORITY_SECRET');
const escrow = keypair('SOLANA_ESCROW_SECRET');
const rewards = keypair('SOLANA_REWARDS_SECRET');
const umi: Umi = createLareaUmi(rpc, authority);

async function balance(pk: Keypair['publicKey']): Promise<number> {
  return Number((await umi.rpc.getBalance(pk)).basisPoints) / 1e9;
}

async function fund(pk: Keypair['publicKey'], want: number, label: string): Promise<void> {
  if ((await balance(pk)) >= want) return;
  try {
    await umi.rpc.airdrop(pk, sol(want));
  } catch (error) {
    console.error(`\nAirdrop to the ${label} wallet failed (${(error as Error).message.split('\n')[0]}).`);
    console.error(`Send at least ${want} SOL to ${pk} (https://faucet.solana.com for devnet), then run this again.`);
    writeEnv();
    process.exit(1);
  }
}

function writeEnv(): void {
  let content = '';
  try {
    content = readFileSync(envFile, 'utf8');
  } catch {
    content = '';
  }
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    content = pattern.test(content) ? content.replace(pattern, line) : `${content.replace(/\n?$/, '\n')}${line}\n`;
  }
  writeFileSync(envFile, content);
}

async function accountExists(address: string | undefined): Promise<boolean> {
  return address ? umi.rpc.accountExists(publicKey(address)) : false;
}

const metadataBase = values['metadata-url'] ?? existing.SOLANA_METADATA_URL ?? `${existing.PUBLIC_URL ?? 'http://localhost:3000'}/solana/metadata`;
updates.SOLANA_METADATA_URL = metadataBase;

await fund(authority.publicKey, cluster === 'localnet' ? 10 : 2, 'authority');
// Escrow pays out and refunds, rewards sends SKR: both need a little SOL for fees and token accounts.
for (const [wallet, label] of [[escrow, 'escrow'], [rewards, 'rewards']] as const) {
  if ((await balance(wallet.publicKey)) < 0.05) {
    await transferSol(umi, { destination: wallet.publicKey, amount: sol(0.1) }).sendAndConfirm(umi);
    console.log(`Sent 0.1 SOL to the ${label} wallet`);
  }
}

/** Soulbound: the Bubblegum V2 plugin plus a permanent freeze, so no stamp can ever be moved. */
async function soulboundCollection(key: string, name: string, path: string): Promise<void> {
  if (await accountExists(existing[key])) {
    updates[key] = existing[key]!;
    return;
  }
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    name,
    uri: `${metadataBase}/${path}`,
    plugins: [{ type: 'BubblegumV2' }, { type: 'PermanentFreezeDelegate', frozen: true, authority: { type: 'UpdateAuthority' } }],
  }).sendAndConfirm(umi);
  updates[key] = collection.publicKey.toString();
  writeEnv();
  console.log(`${name}: ${updates[key]}`);
}
await soulboundCollection('SOLANA_STAMP_COLLECTION', 'Larea Stamps', 'stamps.json');
await soulboundCollection('SOLANA_LEVEL_COLLECTION', 'Larea Levels', 'levels.json');

if (await accountExists(existing.SOLANA_STAMP_TREE)) {
  updates.SOLANA_STAMP_TREE = existing.SOLANA_STAMP_TREE!;
} else {
  // 2^14 = 16,384 leaves per tree; canopy 8 keeps proofs short enough for one transaction.
  const tree = generateSigner(umi);
  await (await createTreeV2(umi, { merkleTree: tree, maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 })).sendAndConfirm(umi);
  updates.SOLANA_STAMP_TREE = tree.publicKey.toString();
  writeEnv();
  console.log(`Stamp tree: ${updates.SOLANA_STAMP_TREE}`);
}

/** Test tokens: the authority is mint authority so `solana:faucet` can hand them out. */
async function testMint(key: 'USDC_MINT' | 'SKR_MINT', initialOwner: Keypair['publicKey'], amount: number): Promise<void> {
  if (await accountExists(existing[key])) {
    updates[key] = existing[key]!;
    return;
  }
  const mint = generateSigner(umi);
  await createMintWithAssociatedToken(umi, {
    mint,
    owner: initialOwner,
    amount: toBaseUnits(amount, TOKEN_DECIMALS),
    decimals: TOKEN_DECIMALS,
  }).sendAndConfirm(umi);
  updates[key] = mint.publicKey.toString();
  writeEnv();
  console.log(`${key}: ${updates[key]}`);
}
await testMint('USDC_MINT', authority.publicKey, 1_000_000);
await testMint('SKR_MINT', rewards.publicKey, 1_000_000);

writeEnv();
console.log(`\nSolana setup for ${cluster} written to ${envFile}.`);
console.log(`Authority ${authority.publicKey} · escrow ${escrow.publicKey} · rewards ${rewards.publicKey}`);
