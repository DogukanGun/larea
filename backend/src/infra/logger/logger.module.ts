import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

/** Fields that must never reach the logs: credentials and raw coordinates. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-auth-client"]',
  'req.headers["x-hmac-signature"]',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.lat',
  'req.body.lng',
  'req.body.accuracy',
  'req.query.lat',
  'req.query.lng',
  'req.query.accuracy',
  'req.body.verification',
  'lat',
  'lng',
  'accuracy',
  'password',
  'refreshToken',
  'accessToken',
];

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
          redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
          autoLogging: { ignore: (req) => req.url === '/health' },
          transport: env.LOG_PRETTY ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } } : undefined,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
