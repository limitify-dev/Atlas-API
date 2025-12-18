import { Controller } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('library/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // TODO: Implement book transaction endpoints
}
