import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  CreateInvoiceDto,
  InvoiceFiltersDto,
  PostFeeDto,
} from '../dto';

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

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'List all invoices (admin / staff view)' })
  findAll(@CurrentUser() user: AuthUser, @Query() filters: InvoiceFiltersDto) {
    return this.invoicesService.findAll(user.tenantId, filters);
  }

  @Get('my')
  @Roles(Role.PARENT)
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT)
  @ApiOperation({
    summary: 'Get a single invoice with submissions and promises',
  })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.findOne(user.tenantId, id);
  }

  @Get('student/:studentId/summary')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.PARENT)
  @ApiOperation({ summary: 'Get payment summary counts for a student' })
  summary(
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
}
