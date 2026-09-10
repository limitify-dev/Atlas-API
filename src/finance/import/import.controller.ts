import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { RequireModule } from '../../common/module-access/require-module.decorator';
import {
  ImportService,
  InvoiceImportPreview,
  PaymentReconciliationPreview,
  PaymentReconciliationRow,
} from './import.service';

@ApiTags('Finance — Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('finance')
@Controller('finance/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Parse and validate a .xlsx/.csv invoice import file (dry-run)',
    description:
      'Returns a preview of valid rows and validation errors. No records are created.',
  })
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.parseAndPreview(user.tenantId, file);
  }

  @Post('commit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Commit a previously-validated preview and create all invoices',
    description: 'Rejects the request if any errors remain in the preview.',
  })
  commit(@CurrentUser() user: AuthUser, @Body() preview: InvoiceImportPreview) {
    return this.importService.commitImport(user.tenantId, preview, user.id);
  }

  @Post('confirm-payments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Confirm payments from preview - matches invoices and marks them paid',
    description:
      'Matches student+amount+dueDate and marks matching invoices as PAID. Used for cross-checking Excel uploads.',
  })
  confirmPayments(
    @CurrentUser() user: AuthUser,
    @Body() preview: PaymentReconciliationPreview,
  ) {
    return this.importService.commitPaymentReconciliation(
      user.tenantId,
      preview.valid,
      user.id,
    );
  }

  @Post('payments/preview')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Match uploaded payment rows to database invoices and preview balances',
    description:
      'Dry-run only. Returns each matched invoice with balance before and after the payment.',
  })
  previewPayments(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.previewPaymentReconciliation(user.tenantId, file);
  }

  @Post('payments/commit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Commit validated Excel payments and update invoice balances',
    description:
      'Rechecks live balances transactionally before recording approved payment submissions and updating invoices.',
  })
  commitPayments(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      valid?: PaymentReconciliationRow[];
      rows?: PaymentReconciliationRow[];
    },
  ) {
    return this.importService.commitPaymentReconciliation(
      user.tenantId,
      body.valid ?? body.rows ?? [],
      user.id,
    );
  }

  @Post('payments/commit-file')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Revalidate and commit an uploaded payment workbook',
    description:
      'Accepts the workbook directly so large reconciliations do not exceed the JSON request limit.',
  })
  async commitPaymentFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const preview = await this.importService.previewPaymentReconciliation(
      user.tenantId,
      file,
    );
    if (preview.errors.length > 0) {
      throw new BadRequestException({
        message:
          'The workbook no longer matches current invoice balances. Preview it again before confirming.',
        errors: preview.errors,
      });
    }
    return this.importService.commitPaymentReconciliation(
      user.tenantId,
      preview.valid,
      user.id,
    );
  }

  @Get('payments/template')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Download open database invoices for Excel reconciliation',
    description:
      'Exports current invoice IDs, balances, and blank payment columns. Only paymentAmount needs to be filled.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async downloadPaymentTemplate(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const buffer =
      await this.importService.generatePaymentReconciliationTemplate(
        user.tenantId,
      );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="payment_reconciliation.xlsx"',
    );
    res.end(buffer);
  }

  @Get('template')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Download an Excel template for bulk invoice import',
    description:
      'Returns a .xlsx file with the expected column headers and one example row.',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  downloadTemplate(@Res() res: Response) {
    const buffer = this.importService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="invoice_import_template.xlsx"',
    );
    res.end(buffer);
  }
}
