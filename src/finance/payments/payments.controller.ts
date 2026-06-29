import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { PaymentsService } from './payments.service';
import { SubmitProofDto } from '../dto/submit-proof.dto';
import { PromiseToPayDto } from '../dto/promise-to-pay.dto';
import { ReviewSubmissionDto } from '../dto/review-submission.dto';
import { ReviewPromiseDto } from '../dto/review-promise.dto';

@ApiTags('Finance — Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── PARENT ACTIONS ──────────────────────────────────────────────────────────

  @Post('invoices/:invoiceId/submit-proof')
  @Roles(Role.STAFF, Role.PARENT)
  @ApiOperation({ summary: 'Submit payment proof for an invoice' })
  submitProof(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SubmitProofDto,
  ) {
    return this.paymentsService.submitProof(
      user.tenantId,
      invoiceId,
      dto,
      user.id,
    );
  }

  @Post('invoices/:invoiceId/promise')
  @Roles(Role.STAFF, Role.PARENT)
  @ApiOperation({
    summary: 'Submit a payment promise (commit to pay by a date)',
  })
  promiseToPay(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: PromiseToPayDto,
  ) {
    return this.paymentsService.promiseToPay(
      user.tenantId,
      invoiceId,
      dto,
      user.id,
    );
  }

  // ─── FINANCE STAFF ACTIONS ───────────────────────────────────────────────────

  @Get('submissions/pending')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all payment submissions awaiting review' })
  getPendingReviews(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getPendingReviews(user.tenantId);
  }

  @Post('submissions/:submissionId/review')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Approve or reject a payment submission' })
  review(
    @CurrentUser() user: AuthUser,
    @Param('submissionId') submissionId: string,
    @Body() dto: ReviewSubmissionDto,
  ) {
    return this.paymentsService.review(
      user.tenantId,
      submissionId,
      dto,
      user.id,
    );
  }

  @Get('promises/pending')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all grace requests awaiting approval' })
  getPendingPromises(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getPendingPromises(user.tenantId);
  }

  @Get('promises/expiring-soon')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List grace requests expiring within 3 days' })
  getExpiringSoon(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getExpiringSoon(user.tenantId);
  }

  @Post('promises/:promiseId/review')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Approve or refuse a grace request' })
  reviewPromise(
    @CurrentUser() user: AuthUser,
    @Param('promiseId') promiseId: string,
    @Body() dto: ReviewPromiseDto,
  ) {
    return this.paymentsService.reviewPromise(
      user.tenantId,
      promiseId,
      dto,
      user.id,
    );
  }

  // ─── SHARED QUERIES ───────────────────────────────────────────────────────────

  @Get('invoices/:invoiceId/submissions')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all payment submissions for an invoice' })
  getSubmissions(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.paymentsService.getSubmissionsForInvoice(
      user.tenantId,
      invoiceId,
    );
  }

  @Get('invoices/:invoiceId/promises')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all payment promises for an invoice' })
  getPromises(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.paymentsService.getPromisesForInvoice(user.tenantId, invoiceId);
  }
}
