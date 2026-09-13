import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { Role } from '../generated/prisma/enums.js';

export interface AccessClaims {
  userId: string;
  role: Role;
}

export class InvalidTokenError extends Error {
  constructor(public readonly expired: boolean) {
    super(expired ? 'token expired' : 'token invalid');
  }
}

const ISSUER = 'larea';

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(@InjectEnv() private readonly env: Env) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  get accessTtlSec(): number {
    return this.env.ACCESS_TOKEN_TTL_SEC;
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.secret);
  }

  /** Throws InvalidTokenError (with `expired` set) on any failure. */
  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { issuer: ISSUER });
      if (!payload.sub || typeof payload.role !== 'string') throw new InvalidTokenError(false);
      return { userId: payload.sub, role: payload.role as Role };
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      throw new InvalidTokenError(err instanceof joseErrors.JWTExpired);
    }
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
