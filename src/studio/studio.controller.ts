import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudioGuard } from './guards/studio.guard';
import { StudioTenantsService } from './services/studio-tenants.service';
import { StudioModulesService } from './services/studio-modules.service';
import { StudioSubscriptionService } from './services/studio-subscription.service';
import { AdminProvisionService } from './services/admin-provision.service';
import { BillingService } from './services/billing.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { FeedbackService } from './services/feedback.service';
import { SubscriptionBillingService } from '../subscription/services/subscription-billing.service';
import { SystemSettingsService } from '../subscription/services/system-settings.service';
import {
  CreateStudioTenantDto,
  UpdateTenantAttendanceScheduleDto,
  UpdateTenantDto,
  UpdateTenantModulesDto,
  UpdateSubscriptionDto,
  UpdateTenantStatusDto,
  CreateAdminInviteDto,
  CreateBillingDto,
  UpdateBillingDto,
  ReviewApprovalDto,
  UpdateFeedbackDto,
  LogPaymentDto,
  ExtendSubscriptionDto,
  SuspendSubscriptionDto,
  UpdateGracePeriodDto,
  SubscriptionQueryDto,
  SystemSettingDto,
} from './dto';
import { TenantSubscriptionStatus } from '../../prisma/generated/client';
import {
  AdminApprovalStatus,
  FeedbackCategory,
  FeedbackStatus,
} from '../../prisma/generated/client';

@ApiTags('Studio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudioGuard)
@Controller('studio')
export class StudioController {
  constructor(
    private readonly tenantsService: StudioTenantsService,
    private readonly modulesService: StudioModulesService,
    private readonly subscriptionService: StudioSubscriptionService,
    private readonly adminProvisionService: AdminProvisionService,
    private readonly billingService: BillingService,
    private readonly approvalService: AdminApprovalService,
    private readonly feedbackService: FeedbackService,
    private readonly subscriptionBilling: SubscriptionBillingService,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  // ── Platform modules ──────────────────────────────────────────

  @Get('modules')
  @ApiOperation({ summary: 'List all platform modules' })
  listModules() {
    return this.modulesService.findAll();
  }

  // ── Tenants ───────────────────────────────────────────────────

  @Get('tenants')
  @ApiOperation({
    summary: 'List all tenants with subscription + module status',
  })
  listTenants() {
    return this.tenantsService.findAll();
  }

  @Post('tenants')
  @ApiOperation({
    summary:
      'Bootstrap a new tenant (creates subscription, modules, and optional admin invite)',
  })
  createTenant(@Body() dto: CreateStudioTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Get full tenant detail' })
  getTenant(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch('tenants/:id')
  @UseInterceptors(FileInterceptor('logoFile'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update tenant basic info and optional logo' })
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @UploadedFile() logoFile?: Express.Multer.File,
  ) {
    return this.tenantsService.update(id, dto, logoFile);
  }

  @Patch('tenants/:id/attendance-settings')
  @ApiOperation({ summary: 'Update a tenant school attendance schedule' })
  updateTenantAttendanceSettings(
    @Param('id') id: string,
    @Body() dto: UpdateTenantAttendanceScheduleDto,
  ) {
    return this.tenantsService.updateAttendanceSchedule(id, dto);
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Update tenant status' })
  updateTenantStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ) {
    return this.tenantsService.updateStatus(id, dto);
  }

  @Delete('tenants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a tenant and all its data' })
  deleteTenant(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }

  @Delete('tenants/:tenantId/users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove an admin user from a tenant' })
  deleteTenantUser(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.tenantsService.deleteUser(tenantId, userId);
  }

  // ── Tenant modules ────────────────────────────────────────────

  @Get('tenants/:id/modules')
  @ApiOperation({ summary: 'Get modules enabled for a tenant' })
  getTenantModules(@Param('id') id: string) {
    return this.modulesService.findForTenant(id);
  }

  @Patch('tenants/:id/modules')
  @ApiOperation({ summary: 'Set enabled modules for a tenant' })
  setTenantModules(
    @Param('id') id: string,
    @Body() dto: UpdateTenantModulesDto,
  ) {
    return this.modulesService.setForTenant(id, dto.enabledModules);
  }

  // ── Subscription ──────────────────────────────────────────────

  @Get('subscriptions')
  @ApiOperation({ summary: 'List all subscriptions' })
  listSubscriptions() {
    return this.subscriptionService.findAll();
  }

  @Get('tenants/:id/subscription')
  @ApiOperation({ summary: 'Get subscription for a tenant' })
  getTenantSubscription(@Param('id') id: string) {
    return this.subscriptionService.findByTenant(id);
  }

  @Patch('tenants/:id/subscription')
  @ApiOperation({
    summary: 'Update tenant subscription (plan, status, end date)',
  })
  updateSubscription(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionService.update(id, dto);
  }

  // ── Admin invites ─────────────────────────────────────────────

  @Get('tenants/:id/invites')
  @ApiOperation({ summary: 'List admin invites for a tenant' })
  listInvites(@Param('id') id: string) {
    return this.adminProvisionService.getInvites(id);
  }

  @Post('tenants/:id/invites')
  @ApiOperation({ summary: 'Generate a new admin invite for a tenant' })
  createInvite(@Param('id') id: string, @Body() dto: CreateAdminInviteDto) {
    return this.adminProvisionService.createInvite(id, dto);
  }

  @Patch('invites/:inviteId/revoke')
  @ApiOperation({ summary: 'Revoke a pending admin invite' })
  revokeInvite(@Param('inviteId') inviteId: string) {
    return this.adminProvisionService.revokeInvite(inviteId);
  }

  @Patch('invites/:inviteId/resend')
  @ApiOperation({
    summary: 'Resend an admin invite email (extends expiry by 48 h)',
  })
  resendInvite(@Param('inviteId') inviteId: string) {
    return this.adminProvisionService.resendInvite(inviteId);
  }

  @Delete('invites/:inviteId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete an admin invite record' })
  deleteInvite(@Param('inviteId') inviteId: string) {
    return this.adminProvisionService.deleteInvite(inviteId);
  }

  @Get('invites/:token/validate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Validate an admin invite token during onboarding' })
  validateInvite(@Param('token') token: string) {
    return this.adminProvisionService.validateAndClaim(token);
  }

  // ── Billing ───────────────────────────────────────────────────

  @Get('billing')
  @ApiOperation({ summary: 'List all billing records across tenants' })
  listBilling() {
    return this.billingService.findAll();
  }

  @Get('tenants/:id/billing')
  @ApiOperation({ summary: 'List billing records for a specific tenant' })
  getTenantBilling(@Param('id') id: string) {
    return this.billingService.findForTenant(id);
  }

  @Post('tenants/:id/billing')
  @ApiOperation({ summary: 'Create a billing period for a tenant' })
  createBilling(@Param('id') id: string, @Body() dto: CreateBillingDto) {
    return this.billingService.create(id, dto);
  }

  @Patch('billing/:id')
  @ApiOperation({ summary: 'Update billing record status or details' })
  updateBilling(@Param('id') id: string, @Body() dto: UpdateBillingDto) {
    return this.billingService.update(id, dto);
  }

  @Delete('billing/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a billing record' })
  deleteBilling(@Param('id') id: string) {
    return this.billingService.delete(id);
  }

  @Post('billing/flag-overdue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Flag all overdue billing records (cron-safe)' })
  flagOverdue() {
    return this.billingService.flagOverdue();
  }

  // ── Subscription & Billing (manual payments + enforcement) ─────

  @Get('subscription-states')
  @ApiOperation({
    summary: 'List all tenants with computed subscription state',
  })
  listSubscriptionStates(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.subscriptionBilling.listTenantsWithState({
      status: status as TenantSubscriptionStatus | undefined,
      search,
    });
  }

  @Get('billing/summary')
  @ApiOperation({ summary: 'Billing dashboard summary cards' })
  billingSummary() {
    return this.subscriptionBilling.getDashboardSummary();
  }

  @Get('tenants/:id/subscription-state')
  @ApiOperation({ summary: 'Get full subscription state for a tenant' })
  tenantSubscriptionState(@Param('id') id: string) {
    return this.subscriptionBilling.getSubscriptionState(id);
  }

  @Post('tenants/:id/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log a manual payment and extend the subscription period',
  })
  logPayment(
    @Param('id') id: string,
    @Body() dto: LogPaymentDto,
    @Request() req: any,
  ) {
    return this.subscriptionBilling.logPayment(id, dto, req.user?.id);
  }

  @Get('tenants/:id/payments')
  @ApiOperation({ summary: 'List manual payments for a tenant' })
  listPayments(@Param('id') id: string, @Query() query: SubscriptionQueryDto) {
    return this.subscriptionBilling.listPayments(id, query);
  }

  @Delete('tenants/:id/payments/:paymentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a payment record (recalculates period + audit)',
  })
  deletePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Request() req: any,
  ) {
    return this.subscriptionBilling.deletePayment(paymentId, req.user?.id);
  }

  @Post('tenants/:id/subscription/extend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manually extend a subscription (comp / adjustment)',
  })
  extendSubscription(
    @Param('id') id: string,
    @Body() dto: ExtendSubscriptionDto,
    @Request() req: any,
  ) {
    return this.subscriptionBilling.extendSubscription(id, dto, req.user?.id);
  }

  @Post('tenants/:id/subscription/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually suspend a tenant (override)' })
  suspendTenant(
    @Param('id') id: string,
    @Body() dto: SuspendSubscriptionDto,
    @Request() req: any,
  ) {
    return this.subscriptionBilling.suspend(id, dto.reason, req.user?.id);
  }

  @Post('tenants/:id/subscription/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a manually suspended tenant' })
  reactivateTenant(@Param('id') id: string, @Request() req: any) {
    return this.subscriptionBilling.reactivate(id, req.user?.id);
  }

  @Patch('tenants/:id/subscription/grace-period')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a tenant grace period (days)' })
  updateGrace(
    @Param('id') id: string,
    @Body() dto: UpdateGracePeriodDto,
    @Request() req: any,
  ) {
    return this.subscriptionBilling.updateGracePeriod(
      id,
      dto.days,
      req.user?.id,
    );
  }

  @Get('tenants/:id/audit-log')
  @ApiOperation({ summary: 'Subscription audit log for a tenant' })
  auditLog(@Param('id') id: string, @Query() query: SubscriptionQueryDto) {
    return this.subscriptionBilling.listAuditLog(id, query);
  }

  // ── System settings (e.g. support contact) ────────────────────

  @Get('settings/:key')
  @ApiOperation({ summary: 'Read a platform system setting' })
  getSetting(@Param('key') key: string) {
    return this.systemSettings.get(key);
  }

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert a platform system setting' })
  setSetting(@Body() dto: SystemSettingDto, @Request() req: any) {
    return this.systemSettings.set(dto.key, dto.value, req.user?.id);
  }

  @Get('support-contact')
  @ApiOperation({
    summary: 'Read the support contact shown on the Subscription Ended screen',
  })
  supportContact() {
    return this.systemSettings.getSupportContact();
  }

  // ── Admin Approvals ───────────────────────────────────────────

  @Get('approvals')
  @ApiQuery({ name: 'status', enum: AdminApprovalStatus, required: false })
  @ApiOperation({ summary: 'List admin approval requests' })
  listApprovals(@Query('status') status?: AdminApprovalStatus) {
    return this.approvalService.findAll(status);
  }

  @Get('approvals/:id')
  @ApiOperation({ summary: 'Get a single approval request' })
  getApproval(@Param('id') id: string) {
    return this.approvalService.findOne(id);
  }

  @Patch('approvals/:id')
  @ApiOperation({ summary: 'Approve or reject an admin account request' })
  reviewApproval(
    @Param('id') id: string,
    @Body() dto: ReviewApprovalDto,
    @Request() req: any,
  ) {
    return this.approvalService.review(id, req.user.id, dto);
  }

  // ── Feedback ──────────────────────────────────────────────────

  @Get('feedback')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'category', enum: FeedbackCategory, required: false })
  @ApiQuery({ name: 'status', enum: FeedbackStatus, required: false })
  @ApiOperation({ summary: 'List all feedback submissions across tenants' })
  listFeedback(
    @Query('tenantId') tenantId?: string,
    @Query('category') category?: FeedbackCategory,
    @Query('status') status?: FeedbackStatus,
  ) {
    return this.feedbackService.findAll({ tenantId, category, status });
  }

  @Get('feedback/stats')
  @ApiOperation({ summary: 'Get feedback statistics' })
  getFeedbackStats() {
    return this.feedbackService.getStats();
  }

  @Get('feedback/:id')
  @ApiOperation({ summary: 'Get a single feedback item' })
  getFeedback(@Param('id') id: string) {
    return this.feedbackService.findOne(id);
  }

  @Patch('feedback/:id')
  @ApiOperation({ summary: 'Update feedback status (reviewed / resolved)' })
  updateFeedback(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedbackService.updateStatus(id, dto);
  }
}
