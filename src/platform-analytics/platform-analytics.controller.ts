import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('platform-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class PlatformAnalyticsController {
  constructor(
    private readonly platformAnalyticsService: PlatformAnalyticsService,
  ) {}

  /**
   * Get comprehensive platform statistics
   */
  @Get('stats')
  async getStats() {
    return this.platformAnalyticsService.getPlatformStats();
  }

  /**
   * Get subscription distribution
   */
  @Get('subscriptions')
  async getSubscriptionDistribution() {
    return this.platformAnalyticsService.getSubscriptionDistribution();
  }

  /**
   * Get growth metrics
   */
  @Get('growth')
  async getGrowthMetrics(@Query('period') period?: string) {
    return this.platformAnalyticsService.getGrowthMetrics(period || 'month');
  }

  /**
   * Get system health metrics
   */
  @Get('health')
  async getSystemHealth() {
    return this.platformAnalyticsService.getSystemHealthMetrics();
  }

  /**
   * Get tenant activity ranking
   */
  @Get('tenant-activity')
  async getTenantActivity(@Query('limit') limit?: string) {
    return this.platformAnalyticsService.getTenantActivityRanking(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  /**
   * Get recent activity for dashboard
   */
  @Get('recent-activity')
  async getRecentActivity(@Query('limit') limit?: string) {
    return this.platformAnalyticsService.getRecentActivity(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Get alerts (expiring subscriptions, limits, errors)
   */
  @Get('alerts')
  async getAlerts() {
    return this.platformAnalyticsService.getAlerts();
  }
}
