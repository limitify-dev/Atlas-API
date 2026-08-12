import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';

/**
 * Producer-side only — registers the queue and exposes the token
 * register/unregister HTTP endpoints, but does NOT run the job processor.
 *
 * The processor (`PushProcessor`, in `PushWorkerModule`) runs in the
 * separate `worker` process (see `src/worker.ts`) instead, so notification
 * delivery no longer competes with HTTP request handling for the API
 * process's event loop, and can be scaled independently of it.
 */
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'push-notifications',
    }),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
