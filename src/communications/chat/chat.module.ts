import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { jwtConstants } from '../../auth/constant';

@Module({
  imports: [
    PrismaModule,
    // The gateway enqueues push jobs directly — no PushModule import needed
    BullModule.registerQueue({ name: 'push-notifications' }),
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
