import { Module } from '@nestjs/common';
import { MessagesModule } from './messages/messages.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    MessagesModule,
    AnnouncementsModule,
    NotificationsModule,
    ChatModule,
    PushModule,
  ],
  exports: [
    MessagesModule,
    AnnouncementsModule,
    NotificationsModule,
    ChatModule,
    PushModule,
  ],
})
export class CommunicationsModule {}
