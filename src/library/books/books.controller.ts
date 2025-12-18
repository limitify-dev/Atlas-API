import { Controller } from '@nestjs/common';
import { BooksService } from './books.service';

@Controller('library/books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  // TODO: Implement book endpoints
}
