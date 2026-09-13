import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { forbidden } from '../errors.js';
import type { AuthenticatedRequest } from '../types.js';

@Injectable()
export class AgeVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user.ageVerified) {
      throw forbidden('AGE_VERIFICATION_REQUIRED', 'Please complete age verification first.');
    }
    return true;
  }
}
