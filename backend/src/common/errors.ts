import { HttpException, HttpStatus } from '@nestjs/common';

/** Every error the API returns has the shape `{ code, message }` plus optional extra fields. */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    extra: Record<string, unknown> = {},
  ) {
    super({ code, message, ...extra }, status);
  }
}

export const unauthorized = (message = 'Please sign in again.') =>
  new AppError('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
export const forbidden = (code: string, message: string, extra?: Record<string, unknown>) =>
  new AppError(code, message, HttpStatus.FORBIDDEN, extra);
export const notFound = (message = 'Not found.') => new AppError('NOT_FOUND', message, HttpStatus.NOT_FOUND);
export const conflict = (code: string, message: string) => new AppError(code, message, HttpStatus.CONFLICT);
export const badRequest = (code: string, message: string, extra?: Record<string, unknown>) =>
  new AppError(code, message, HttpStatus.BAD_REQUEST, extra);
export const unprocessable = (code: string, message: string, extra?: Record<string, unknown>) =>
  new AppError(code, message, HttpStatus.UNPROCESSABLE_ENTITY, extra);
export const tooMany = (message: string, extra?: Record<string, unknown>) =>
  new AppError('RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS, extra);
export const unavailable = (code: string, message: string) =>
  new AppError(code, message, HttpStatus.SERVICE_UNAVAILABLE);
