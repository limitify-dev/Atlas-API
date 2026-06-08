import { Global, Module } from '@nestjs/common';
import { DomainEventsService } from './domain-events.service';

/**
 * Global module — import once in AppModule.
 * All feature modules inject DomainEventsService without re-importing this module.
 */
@Global()
@Module({
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
