import { Module } from '@nestjs/common';
import { BooksModule } from './books/books.module';
import { BookTransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [BooksModule, BookTransactionsModule],
  exports: [BooksModule, BookTransactionsModule],
})
export class LibraryModule {}
