import bs58 from 'bs58';
import nacl from 'tweetnacl';

/** What the backend asks the wallet to sign (Sign In With Solana, the wallet-standard message format). */
export interface SiwsChallenge {
  domain: string;
  statement: string;
  uri: string;
  version: '1';
  chainId: string;
  nonce: string;
  issuedAt: string;
}

export class SiwsError extends Error {}

/** Parses the `Key: value` lines of a SIWS message after its two header lines. */
function fields(message: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of message.split('\n')) {
    const match = /^([A-Za-z ]+): (.+)$/.exec(line);
    if (match) map.set(match[1].trim(), match[2].trim());
  }
  return map;
}

/**
 * Checks a signed SIWS message: the right domain, the claimed address, our nonce, recent issue time,
 * and a valid ed25519 signature by that address. Throws SiwsError with the reason otherwise.
 */
export function verifySiws(input: {
  address: string;
  message: Uint8Array;
  signature: Uint8Array;
  expected: Pick<SiwsChallenge, 'domain' | 'nonce'>;
  now?: Date;
  maxAgeSec?: number;
}): void {
  let publicKey: Uint8Array;
  try {
    publicKey = bs58.decode(input.address);
  } catch {
    throw new SiwsError('not a Solana address');
  }
  if (publicKey.length !== 32) throw new SiwsError('not a Solana address');
  if (input.signature.length !== 64) throw new SiwsError('bad signature length');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(input.message);
  const [header, addressLine] = text.split('\n');
  if (header !== `${input.expected.domain} wants you to sign in with your Solana account:`) throw new SiwsError('wrong domain');
  if (addressLine?.trim() !== input.address) throw new SiwsError('address mismatch');
  const values = fields(text);
  if (values.get('Nonce') !== input.expected.nonce) throw new SiwsError('wrong nonce');
  const issued = Date.parse(values.get('Issued At') ?? '');
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(issued) || Math.abs(now - issued) > (input.maxAgeSec ?? 600) * 1000) throw new SiwsError('stale message');
  const expires = values.get('Expiration Time');
  if (expires && Date.parse(expires) < now) throw new SiwsError('expired message');
  if (!nacl.sign.detached.verify(input.message, input.signature, publicKey)) throw new SiwsError('invalid signature');
}

/** Builds the message exactly as wallets do (used by tests and the fake wallet). */
export function siwsMessage(address: string, challenge: SiwsChallenge): string {
  return [
    `${challenge.domain} wants you to sign in with your Solana account:`,
    address,
    '',
    challenge.statement,
    '',
    `URI: ${challenge.uri}`,
    `Version: ${challenge.version}`,
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
  ].join('\n');
}
