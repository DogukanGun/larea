import { Global, Module } from '@nestjs/common';
import { loadDotEnvIfPresent, loadEnv, type Env } from './env.js';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => {
        loadDotEnvIfPresent();
        return loadEnv();
      },
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
