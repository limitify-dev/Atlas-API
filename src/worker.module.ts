import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { PushWorkerModule } from './communications/push/push-worker.module';

/**
 * Root module for the standalone worker process (`src/worker.ts`).
 *
 * Deliberately lean — only what background job processors need
 * (Prisma + the queues themselves), not the full HTTP `AppModule` graph
 * (no controllers, no guards, no Socket.IO gateway).
 *
 * Add new `*WorkerModule`s here as more queues/processors are split out of
 * the API process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    PrismaModule,
    PushWorkerModule,
  ],
})
export class WorkerModule {}
