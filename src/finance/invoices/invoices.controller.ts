import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { InvoicesService } from './invoices.service';
import {
  BulkCreateInvoiceDto,
  BulkUpdateInvoiceDto,
  CreateInvoiceDto,
  InvoiceFiltersDto,
  PostFeeDto,
  SendInvoiceReminderDto,
} from '../dto';

const READ_THROTTLE = { default: { limit: 200, ttl: 60_000 } };

@ApiTags('Finance — Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a single invoice for a student' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createOne(user.tenantId, dto, user.id);
  }

  @Post('bulk')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Bulk-create invoices from a JSON array' })
  createBulk(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateInvoiceDto) {
    return this.invoicesService.createBulk(user.tenantId, dto, user.id);
  }

  @Post('post-fee')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Post a fee to all students, a section, a grade, or specific students',
    description:
      'Creates one invoice per matched student. scope="all" targets every student in the tenant; ' +
      'scope="section" requires sectionId; scope="grade" requires gradeId; ' +
      'scope="students" requires studentIds array.',
  })
  postFee(@CurrentUser() user: AuthUser, @Body() dto: PostFeeDto) {
    return this.invoicesService.postFee(user.tenantId, dto, user.id);
  }

  @Post('reminders/send')
  @Throttle(READ_THROTTLE)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Send payment reminder(s) for one or more invoices to parent(s)',
  })
  sendReminder(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendInvoiceReminderDto,
  ) {
    const { invoiceId, invoiceIds, channel, customMessage } = dto;
    const targets = invoiceIds?.length ? invoiceIds : invoiceId ? [invoiceId] : [];
    if (!targets.length) {
      throw new BadRequestException(
        'invoiceId or invoiceIds must be provided.',
      );
    }
    if (targets.length === 1) {
      return this.invoicesService.sendReminder(
        user.tenantId,
        targets[0],
        channel ?? 'both',
        customMessage,
      );
    }
    return this.invoicesService.sendReminders(
      user.tenantId,
      targets,
      channel ?? 'both',
      customMessage,
    );
  }

  @Get()
  @Throttle(READ_THROTTLE)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'List all invoices (admin / staff view)' })
  findAll(@CurrentUser() user: AuthUser, @Query() filters: InvoiceFiltersDto) {
    return this.invoicesService.findAll(user.tenantId, filters);
  }

  @Get('summary')
  @Throttle(READ_THROTTLE)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'Get tenant invoice summary totals' })
  summary(@CurrentUser() user: AuthUser) {
    return this.invoicesService.getSummary(user.tenantId);
  }

  // Declared before `@Get(':id')` so this static path isn't captured as an id.
  @Get('fee-items')
  @Throttle(READ_THROTTLE)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'Aggregated fee items (invoices grouped by title) for the tenant',
  })
  feeItems(
    @CurrentUser() user: AuthUser,
    @Query('archived') archived?: string,
  ) {
    return this.invoicesService.getFeeItems(user.tenantId, archived === 'true');
  }

  // Declared before `@Get(':id')` so this static path isn't captured as an id.
  @Get('students/outstanding')
  @Throttle(READ_THROTTLE)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'Per-student outstanding balances (grouped) for the tenant',
  })
  studentsOutstanding(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    return this.invoicesService.getStudentsOutstanding(user.tenantId, {
      status,
      sectionId,
      gradeId,
    });
  }

  @Get('my')
  @Roles(Role.STAFF)
  @ApiOperation({
    summary: 'List invoices for the authenticated parent children',
  })
  findForParent(
    @CurrentUser() user: AuthUser,
    @Query() filters: InvoiceFiltersDto,
  ) {
    return this.invoicesService.findForParent(user.tenantId, user.id, filters);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.STAFF)
  @ApiOperation({
    summary: 'Get a single invoice with submissions and promises',
  })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.findOne(user.tenantId, id);
  }

  @Get('student/:studentId/summary')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get payment summary counts for a student' })
  summaryForStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
  ) {
    return this.invoicesService.getSummaryForStudent(user.tenantId, studentId);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cancel an invoice (cannot cancel PAID invoices)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.cancel(user.tenantId, id, user.id);
  }

  @Post('bulk-delete')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Delete multiple invoices (skips PAID / under-review ones)',
  })
  bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: { invoiceIds: string[] }) {
    return this.invoicesService.bulkDelete(user.tenantId, dto.invoiceIds);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Delete an invoice (cannot delete PAID or under-review invoices)',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.remove(user.tenantId, id);
  }

  @Post('bulk-archive')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Archive multiple invoices (reversible; any status, including PAID)',
  })
  bulkArchive(@CurrentUser() user: AuthUser, @Body() dto: { invoiceIds: string[] }) {
    return this.invoicesService.bulkArchive(user.tenantId, dto.invoiceIds);
  }

  @Post('bulk-unarchive')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Restore multiple archived invoices' })
  bulkUnarchive(@CurrentUser() user: AuthUser, @Body() dto: { invoiceIds: string[] }) {
    return this.invoicesService.bulkUnarchive(user.tenantId, dto.invoiceIds);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update an invoice' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    dto: {
      amount?: number;
      currency?: string;
      dueDate?: string;
      description?: string;
    },
  ) {
    return this.invoicesService.update(user.tenantId, id, dto);
  }

  @Patch('bulk')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update multiple invoices at once' })
  bulkUpdate(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkUpdateInvoiceDto,
  ) {
    return this.invoicesService.bulkUpdate(
      user.tenantId,
      dto.invoiceIds,
      dto,
    );
  }
}
