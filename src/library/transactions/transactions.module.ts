import { Module } from '@nestjs/common';
import { BookTransactionsController } from './transactions.controller';
import { BookTransactionsService } from './transactions.service';
import { NotificationsModule } from '../../communications/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BookTransactionsController],
  providers: [BookTransactionsService],
  exports: [BookTransactionsService],
})
export class BookTransactionsModule {}
