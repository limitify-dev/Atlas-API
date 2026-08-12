import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatUploadController } from './chat-upload.controller';
import { ChatGateway } from './chat.gateway';
import { ChatPresenceService } from './chat-presence.service';
import { jwtConstants } from '../../auth/constant';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule,
    // The gateway enqueues push jobs directly — no PushModule import needed
    BullModule.registerQueue({ name: 'push-notifications' }),
    JwtModule.register({
      secret: jwtConstants.secret,
    }),
  ],
  controllers: [ChatController, ChatUploadController],
  providers: [ChatService, ChatGateway, ChatPresenceService],
  exports: [ChatService],
})
export class ChatModule {}
