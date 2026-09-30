import { parseArgs } from 'node:util';
import { createAssociatedToken, findAssociatedTokenPda, mintTokensTo, transferSol } from '@metaplex-foundation/mpl-toolbox';
import { publicKey, sol } from '@metaplex-foundation/umi';
import { loadDotEnvIfPresent } from '../config/env.js';
import { createLareaUmi, keypairFromSecret, TOKEN_DECIMALS, toBaseUnits } from '../solana/chain.js';

/**
 * Local and devnet testing: gives a wallet SOL (for fees), test USDC and test SKR.
 *
 *   node dist/scripts/solana-faucet.js --to <wallet address> [--sol 1] [--usdc 100] [--skr 100]
 */
const { values } = parseArgs({
  options: { to: { type: 'string' }, sol: { type: 'string', default: '1' }, usdc: { type: 'string', default: '100' }, skr: { type: 'string', default: '100' } },
});
loadDotEnvIfPresent();
// Only the Solana settings matter here; the rest of the backend configuration is not needed.
const env = {
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
  SOLANA_CLUSTER: process.env.SOLANA_CLUSTER ?? 'localnet',
  SOLANA_AUTHORITY_SECRET: process.env.SOLANA_AUTHORITY_SECRET,
  USDC_MINT: process.env.USDC_MINT,
  SKR_MINT: process.env.SKR_MINT,
};
if (!values.to || !env.SOLANA_AUTHORITY_SECRET || !env.USDC_MINT || !env.SKR_MINT) {
  console.error('usage: solana-faucet --to <address> (run solana:setup first)');
  process.exit(2);
}
const probe = createLareaUmi(env.SOLANA_RPC_URL);
const umi = createLareaUmi(env.SOLANA_RPC_URL, keypairFromSecret(probe, env.SOLANA_AUTHORITY_SECRET));
const owner = publicKey(values.to);

if (Number(values.sol) > 0) {
  if (env.SOLANA_CLUSTER === 'localnet') await umi.rpc.airdrop(owner, sol(Number(values.sol)));
  else await transferSol(umi, { destination: owner, amount: sol(Number(values.sol)) }).sendAndConfirm(umi);
}
for (const [mintAddress, amount, label] of [[env.USDC_MINT, values.usdc, 'USDC'], [env.SKR_MINT, values.skr, 'SKR']] as const) {
  if (Number(amount) <= 0) continue;
  const mint = publicKey(mintAddress);
  const token = findAssociatedTokenPda(umi, { mint, owner });
  if (!(await umi.rpc.accountExists(token[0]))) await createAssociatedToken(umi, { mint, owner }).sendAndConfirm(umi);
  // The authority is the mint authority of both test mints (SKR's initial supply went to rewards).
  await mintTokensTo(umi, { mint, token, amount: toBaseUnits(Number(amount), TOKEN_DECIMALS) }).sendAndConfirm(umi);
  console.log(`${amount} ${label} → ${values.to}`);
}
console.log('done');
