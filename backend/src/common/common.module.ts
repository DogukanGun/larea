import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { appValidationPipe } from './validation.pipe.js';

@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_PIPE, useValue: appValidationPipe },
  ],
})
export class CommonModule {}
