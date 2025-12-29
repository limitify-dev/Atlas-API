import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SystemLogsService, CreateLogDto, LogFilters } from './system-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LogLevel } from '../../prisma/generated/client';

@Controller('system-logs')
@UseGuards(JwtAuthGuard)
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

  @Post()
  async createLog(@Request() req: any, @Body() data: CreateLogDto) {
    // This endpoint is primarily for internal use or manual log creation
    return this.systemLogsService.createLog({
      ...data,
      userId: data.userId || req.user?.userId,
      ipAddress: data.ipAddress || req.ip,
      userAgent: data.userAgent || req.headers['user-agent'],
    });
  }
}
