import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesService } from './invoices/invoices.service';
import { InvoicesController } from './invoices/invoices.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentsController } from './payments/payments.controller';
import { ImportService } from './import/import.service';
import { ImportController } from './import/import.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InvoicesController, PaymentsController, ImportController],
  providers: [InvoicesService, PaymentsService, ImportService],
  exports: [InvoicesService, PaymentsService],
})
export class FinanceModule {}
