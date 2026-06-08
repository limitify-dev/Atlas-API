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
import { LogLevel, Role } from '../../prisma/generated/client';

@Controller('system-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Get()
  async getLogs(
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
    const filters: LogFilters = {
      level,
      tenantId,
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
  async getStats(@Query('tenantId') tenantId?: string) {
    return this.systemLogsService.getLogStats(tenantId);
  }

  @Get(':id')
  async getLogById(@Param('id') id: string) {
    return this.systemLogsService.getLogById(id);
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
