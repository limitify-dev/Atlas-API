// Same reasoning as main.ts — must run before any other import.
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

/**
 * Standalone entry point for background job processing (currently: push
 * notifications). Runs as its own process/container — see
 * docker-compose.yml's `worker` service — so notification volume can never
 * starve the API's HTTP handling, and either side can be scaled
 * independently.
 *
 * No HTTP server, no Socket.IO gateway — just an application context that
 * keeps BullMQ's workers alive.
 */
async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Drain BullMQ workers and disconnect Prisma cleanly on SIGTERM/SIGINT so
  // in-flight jobs aren't cut off when the container stops/restarts.
  app.enableShutdownHooks();
  logger.log('Worker process started — listening for queued jobs.');
}
bootstrap().catch((err) => {
  console.error('Fatal error during worker bootstrap:', err);
  process.exit(1);
});
