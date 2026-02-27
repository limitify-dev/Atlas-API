import { Module } from '@nestjs/common';
import { BookTransactionsController } from './transactions.controller';
import { BookTransactionsService } from './transactions.service';
import { PushModule } from '../../communications/push/push.module';

@Module({
  imports: [PushModule],
  controllers: [BookTransactionsController],
  providers: [BookTransactionsService],
  exports: [BookTransactionsService],
})
export class BookTransactionsModule {}
