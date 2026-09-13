import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { forbidden } from '../errors.js';
import type { AuthenticatedRequest } from '../types.js';

@Injectable()
export class NotSuspendedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user.suspendedAt) {
      throw forbidden('SUSPENDED', 'Your account has been suspended.', { suspendedAt: user.suspendedAt });
    }
    return true;
  }
}
