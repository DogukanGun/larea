import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, UserSnapshot } from '../types.js';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): UserSnapshot => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
});
