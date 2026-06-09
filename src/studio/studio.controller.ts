import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudioGuard } from './guards/studio.guard';
import { StudioTenantsService } from './services/studio-tenants.service';
import { StudioModulesService } from './services/studio-modules.service';
import { StudioSubscriptionService } from './services/studio-subscription.service';
import { AdminProvisionService } from './services/admin-provision.service';
import {
  CreateStudioTenantDto,
  UpdateTenantModulesDto,
  UpdateSubscriptionDto,
  UpdateTenantStatusDto,
  CreateAdminInviteDto,
} from './dto';

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
  ) {}

  // ── Platform modules ──────────────────────────────────────────

  @Get('modules')
  @ApiOperation({ summary: 'List all platform modules' })
  listModules() {
    return this.modulesService.findAll();
  }

  // ── Tenants ───────────────────────────────────────────────────

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with subscription + module status' })
  listTenants() {
    return this.tenantsService.findAll();
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Bootstrap a new tenant (creates subscription, modules, and optional admin invite)' })
  createTenant(@Body() dto: CreateStudioTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Get full tenant detail' })
  getTenant(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Update tenant status (active / suspended / trial / cancelled)' })
  updateTenantStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsService.updateStatus(id, dto);
  }

  @Delete('tenants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete a tenant and all its data' })
  deleteTenant(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }

  // ── Tenant modules ────────────────────────────────────────────

  @Get('tenants/:id/modules')
  @ApiOperation({ summary: 'Get modules enabled for a tenant' })
  getTenantModules(@Param('id') id: string) {
    return this.modulesService.findForTenant(id);
  }

  @Patch('tenants/:id/modules')
  @ApiOperation({ summary: 'Set enabled modules for a tenant' })
  setTenantModules(@Param('id') id: string, @Body() dto: UpdateTenantModulesDto) {
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
  @ApiOperation({ summary: 'Update tenant subscription (plan, status, end date)' })
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
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

  // Public-ish: validate an invite token (called during onboarding)
  // Note: This specific route does NOT require StudioGuard since the admin
  // needs to validate their token before they have a session.
  @Get('invites/:token/validate')
  @UseGuards(JwtAuthGuard) // override: only JWT, not StudioGuard
  @ApiOperation({ summary: 'Validate an admin invite token during onboarding' })
  validateInvite(@Param('token') token: string) {
    return this.adminProvisionService.validateAndClaim(token);
  }
}
