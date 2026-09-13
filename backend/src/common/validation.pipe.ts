import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { badRequest } from './errors.js';

function firstMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    if (error.constraints) return Object.values(error.constraints)[0];
    if (error.children?.length) return firstMessage(error.children);
  }
  return 'Invalid request.';
}

export const appValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: (errors) => badRequest('VALIDATION', firstMessage(errors)),
});
