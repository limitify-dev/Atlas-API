import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  SystemLogsService,
  CreateLogDto,
  LogFilters,
} from './system-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { LogLevel, Role } from '../../prisma/generated/client';

@Controller('system-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Get()
  async getLogs(
    @CurrentUser() user: AuthUser,
    @Query('level') level?: LogLevel,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('endpoint') endpoint?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // A tenant ADMIN must never see other tenants' logs (IPs, emails,
    // stack traces). TenantGuard only rejects a *mismatched* supplied
    // tenantId, not an omitted one, so the default has to be forced here.
    const effectiveTenantId =
      user.role === Role.SUPER_ADMIN ? tenantId : user.tenantId;

    const filters: LogFilters = {
      level,
      tenantId: effectiveTenantId,
      userId,
      search,
      endpoint,
    };

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    return this.systemLogsService.getLogs(
      filters,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('stats')
  async getStats(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId?: string,
  ) {
    const effectiveTenantId =
      user.role === Role.SUPER_ADMIN ? tenantId : user.tenantId;
    return this.systemLogsService.getLogStats(effectiveTenantId);
  }

  @Get(':id')
  async getLogById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.systemLogsService.getLogById(
      id,
      user.role === Role.SUPER_ADMIN ? null : user.tenantId,
    );
  }

  @Post()
  async createLog(
    @Request()
    req: {
      user?: {
        userId: string;
      };
      ip?: string;
      headers?: {
        'user-agent'?: string;
      };
    },
    @Body() data: CreateLogDto,
  ) {
    // This endpoint is primarily for internal use or manual log creation
    return this.systemLogsService.createLog({
      ...data,
      userId: data.userId || req.user?.userId,
      ipAddress: data.ipAddress || req.ip,
      userAgent: data.userAgent || req.headers?.['user-agent'],
    });
  }
}
