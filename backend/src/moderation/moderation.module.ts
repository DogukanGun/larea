import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { FakeModerationClient } from '../testing/fake-moderation.client.js';
import { OpenAIModerationClient } from './openai-moderation.client.js';
import { MODERATION_CLIENT, type ModerationClient } from './moderation.types.js';
import { ModerationService } from './moderation.service.js';

@Global()
@Module({
  providers: [
    ModerationService,
    {
      provide: MODERATION_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): ModerationClient => {
        if (env.NODE_ENV === 'test') return new FakeModerationClient();
        if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required outside the test environment');
        return new OpenAIModerationClient({
          apiKey: env.OPENAI_API_KEY,
          model: env.OPENAI_MODEL,
          moderationModel: env.OPENAI_MODERATION_MODEL,
          timeoutMs: env.MODERATION_TIMEOUT_MS,
        });
      },
    },
  ],
  exports: [ModerationService, MODERATION_CLIENT],
})
export class ModerationModule {}
