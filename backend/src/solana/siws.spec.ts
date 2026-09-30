import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { type SiwsChallenge, siwsMessage, verifySiws } from './siws.js';

const keys = nacl.sign.keyPair();
const address = bs58.encode(keys.publicKey);
const now = new Date('2026-09-30T12:00:00.000Z');
const challenge: SiwsChallenge = {
  domain: 'larea.dogukangundogan.com',
  statement: 'Link this wallet to your Larea account.',
  uri: 'https://larea.dogukangundogan.com',
  version: '1',
  chainId: 'solana:devnet',
  nonce: 'abc123',
  issuedAt: now.toISOString(),
};

function signed(overrides: Partial<SiwsChallenge> = {}, signer = keys) {
  const message = new TextEncoder().encode(siwsMessage(address, { ...challenge, ...overrides }));
  return { message, signature: nacl.sign.detached(message, signer.secretKey) };
}

describe('verifySiws', () => {
  const expected = { domain: challenge.domain, nonce: challenge.nonce };

  it('accepts a message signed by the claimed address', () => {
    expect(() => verifySiws({ address, ...signed(), expected, now })).not.toThrow();
  });

  it('rejects another domain, nonce, a stale message or a foreign signature', () => {
    expect(() => verifySiws({ address, ...signed({ domain: 'evil.example' }), expected, now })).toThrow('wrong domain');
    expect(() => verifySiws({ address, ...signed({ nonce: 'other' }), expected, now })).toThrow('wrong nonce');
    expect(() => verifySiws({ address, ...signed({ issuedAt: '2026-09-30T10:00:00.000Z' }), expected, now })).toThrow('stale message');
    expect(() => verifySiws({ address, ...signed({}, nacl.sign.keyPair()), expected, now })).toThrow('invalid signature');
  });

  it('rejects a message naming another address', () => {
    const other = bs58.encode(nacl.sign.keyPair().publicKey);
    expect(() => verifySiws({ address: other, ...signed(), expected, now })).toThrow('address mismatch');
  });
});
