import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getStats(user.tenantId);
  }
}
