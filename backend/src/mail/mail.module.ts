import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { FakeMailClient } from '../testing/fake-mail.client.js';
import { SmtpMailClient } from './smtp-mail.client.js';
import { MAIL_CLIENT, type MailClient } from './mail.types.js';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_CLIENT,
      inject: [ENV],
      // null when no SMTP server is configured: features that send mail answer "unavailable".
      useFactory: (env: Env): MailClient | null => {
        if (env.NODE_ENV === 'test') return new FakeMailClient();
        return env.SMTP_URL ? new SmtpMailClient(env.SMTP_URL, env.MAIL_FROM) : null;
      },
    },
  ],
  exports: [MAIL_CLIENT],
})
export class MailModule {}
