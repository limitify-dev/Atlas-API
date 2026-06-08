import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from './messages/messages.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { PushModule } from './push/push.module';
import { DomainEventHandler } from './handlers/domain-event.handler';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'push-notifications' }),
    MessagesModule,
    AnnouncementsModule,
    NotificationsModule,
    ChatModule,
    PushModule,
  ],
  providers: [DomainEventHandler],
  exports: [
    MessagesModule,
    AnnouncementsModule,
    NotificationsModule,
    ChatModule,
    PushModule,
  ],
})
export class CommunicationsModule {}
