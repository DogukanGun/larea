import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { unauthorized } from '../common/errors.js';
import type { AuthenticatedRequest } from '../common/types.js';
import { UsersService } from '../users/users.service.js';
import { InvalidTokenError, TokenService } from './token.service.js';

/** Verifies the bearer token and attaches the cached user snapshot as `req.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let userId: string;
    try {
      ({ userId } = await this.tokens.verifyAccess(header.slice('Bearer '.length).trim()));
    } catch (err) {
      throw unauthorized(err instanceof InvalidTokenError && err.expired ? 'Your session expired. Please sign in again.' : undefined);
    }

    const user = await this.users.getSnapshot(userId);
    if (!user) throw unauthorized();
    req.user = user;
    return true;
  }
}
