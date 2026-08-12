import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushService } from './push.service';
import { PushProcessor } from './push.processor';

/**
 * Worker-side only — runs the BullMQ processor that actually delivers
 * queued push notifications. Bootstrapped exclusively by `src/worker.ts`,
 * never by the HTTP `AppModule`. See `PushModule` for the producer side.
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'push-notifications',
    }),
  ],
  providers: [PushService, PushProcessor],
})
export class PushWorkerModule {}
