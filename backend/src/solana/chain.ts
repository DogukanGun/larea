import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { createSignerFromKeypair, keypairIdentity, type Keypair, type Signer, type Umi } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import bs58 from 'bs58';

/** A umi instance with the programs Larea uses (Bubblegum V2, Core, SPL token helpers). */
export function createLareaUmi(rpcUrl: string, identity?: Keypair): Umi {
  const umi = createUmi(rpcUrl, 'confirmed').use(mplBubblegum()).use(mplCore()).use(mplToolbox());
  if (identity) umi.use(keypairIdentity(identity));
  return umi;
}

export function keypairFromSecret(umi: Pick<Umi, 'eddsa'>, secret: string): Keypair {
  return umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret.trim()));
}

export function secretOf(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}

export function signerFromSecret(umi: Umi, secret: string): Signer {
  return createSignerFromKeypair(umi, keypairFromSecret(umi, secret));
}

/** Whole tokens → base units for a mint with `decimals`. */
export function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/** Programs a local validator needs to clone from devnet (see scripts/solana-validator.sh). */
export const CLONED_PROGRAMS = [
  'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY', // Bubblegum
  'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d', // Core
  'mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW', // MPL account compression
  'mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3', // MPL noop
  'SysExL2WDyJi9aRZrXorrjHJut3JwHQ7R9bTyctbNNG', // MPL system extras (mint creation)
] as const;

/** Stablecoin and SKR both use 6 decimals. */
export const TOKEN_DECIMALS = 6;
