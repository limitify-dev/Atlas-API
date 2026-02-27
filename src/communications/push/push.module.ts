import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushProcessor } from './push.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'push-notifications',
    }),
  ],
  controllers: [PushController],
  providers: [PushService, PushProcessor],
  exports: [PushService],
})
export class PushModule {}
