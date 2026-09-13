import { Global, Module } from '@nestjs/common';
import { ConnectionRegistry } from './connection-registry.js';
import { RealtimeBus } from './realtime.bus.js';

/** Registry and bus are global so any module can emit events without import cycles. */
@Global()
@Module({
  providers: [ConnectionRegistry, RealtimeBus],
  exports: [ConnectionRegistry, RealtimeBus],
})
export class RealtimeCoreModule {}
