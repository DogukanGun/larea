import argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/** Loads .env without overriding variables already present in the environment. */
function loadDotEnv(path = '.env'): void {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(content))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

/**
 * Bootstraps the first moderator account. Venues are never seeded: real places are
 * discovered from OpenStreetMap around each user.
 */
const email = process.env.SEED_MODERATOR_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_MODERATOR_PASSWORD;
if (!email || !password) {
  console.log('Set SEED_MODERATOR_EMAIL and SEED_MODERATOR_PASSWORD to create or promote the moderator account.');
  process.exit(0);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
const displayName = process.env.SEED_MODERATOR_NAME?.trim() || 'moderator';
// An existing account keeps its own password; only the role is promoted.
await prisma.user.upsert({
  where: { email },
  update: { role: 'MODERATOR' },
  create: {
    email,
    passwordHash,
    displayName,
    displayNameLower: displayName.toLowerCase(),
    role: 'MODERATOR',
    ageVerifiedAt: new Date(),
    ageThreshold: 18,
    verificationProvider: 'bootstrap',
    verificationRef: 'operator',
  },
});
console.log(`moderator ${email} ready`);
await prisma.$disconnect();
