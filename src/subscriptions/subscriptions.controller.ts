import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService, UpdateSubscriptionDto } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * Get subscription details for a tenant
   */
  @Get(':tenantId')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async getSubscription(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getSubscription(tenantId);
  }

  /**
   * Update subscription for a tenant
   */
  @Patch(':tenantId')
  @Roles('SUPER_ADMIN')
  async updateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() data: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateSubscription(tenantId, data);
  }

  /**
   * Get usage statistics for a tenant
   */
  @Get(':tenantId/usage')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async getUsageStats(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getUsageStats(tenantId);
  }

  /**
   * Check resource limits for a tenant
   */
  @Get(':tenantId/limits')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async checkLimits(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.checkResourceLimits(tenantId);
  }

  /**
   * Get subscription summary for all tenants
   */
  @Get()
  @Roles('SUPER_ADMIN')
  async getSummary() {
    return this.subscriptionsService.getSubscriptionSummary();
  }

  /**
   * Extend subscription for a tenant
   */
  @Post(':tenantId/extend')
  @Roles('SUPER_ADMIN')
  async extendSubscription(
    @Param('tenantId') tenantId: string,
    @Body('days') days: number,
  ) {
    return this.subscriptionsService.extendSubscription(tenantId, days);
  }

  /**
   * Get expiring subscriptions
   */
  @Get('expiring/list')
  @Roles('SUPER_ADMIN')
  async getExpiringSubscriptions(@Query('days') days?: string) {
    return this.subscriptionsService.getExpiringSubscriptions(
      days ? parseInt(days, 10) : 30,
    );
  }
}
