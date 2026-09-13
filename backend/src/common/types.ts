import type { Request } from 'express';
import type { Role } from '../generated/prisma/enums.js';

/** Cached, minimal view of a user used by guards on every request. */
export interface UserSnapshot {
  id: string;
  role: Role;
  displayName: string;
  ageVerified: boolean;
  mutedUntil: string | null;
  suspendedAt: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: UserSnapshot;
}
