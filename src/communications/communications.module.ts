import { Module } from '@nestjs/common';
import { MessagesModule } from './messages/messages.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [MessagesModule, AnnouncementsModule, NotificationsModule],
  exports: [MessagesModule, AnnouncementsModule, NotificationsModule],
})
export class CommunicationsModule {}
