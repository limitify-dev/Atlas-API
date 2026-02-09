import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogLevel } from '../../prisma/generated/client';

export interface CreateLogDto {
  level: LogLevel;
  message: string;
  metadata?: any;
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
}

export interface LogFilters {
  level?: LogLevel;
  tenantId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  endpoint?: string;
}

@Injectable()
export class SystemLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new system log entry
   */
  async createLog(data: CreateLogDto) {
    return this.prisma.systemLog.create({
      data: {
        level: data.level,
        message: data.message,
        metadata: data.metadata || null,
        userId: data.userId,
        tenantId: data.tenantId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        duration: data.duration,
      },
    });
  }

  /**
   * Get logs with filtering and pagination
   */
  async getLogs(
    filters: LogFilters,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.level) {
      where.level = filters.level;
    }

    if (filters.tenantId) {
      where.tenantId = filters.tenantId;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.endpoint) {
      where.endpoint = { contains: filters.endpoint, mode: 'insensitive' };
    }

    if (filters.search) {
      where.message = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get log statistics
   */
  async getLogStats(tenantId?: string) {
    const where: any = tenantId ? { tenantId } : {};

    const [
      total,
      debugCount,
      infoCount,
      warnCount,
      errorCount,
      criticalCount,
      last24Hours,
    ] = await Promise.all([
      this.prisma.systemLog.count({ where }),
      this.prisma.systemLog.count({ where: { ...where, level: 'DEBUG' } }),
      this.prisma.systemLog.count({ where: { ...where, level: 'INFO' } }),
      this.prisma.systemLog.count({ where: { ...where, level: 'WARN' } }),
      this.prisma.systemLog.count({ where: { ...where, level: 'ERROR' } }),
      this.prisma.systemLog.count({ where: { ...where, level: 'CRITICAL' } }),
      this.prisma.systemLog.count({
        where: {
          ...where,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total,
      byLevel: {
        debug: debugCount,
        info: infoCount,
        warn: warnCount,
        error: errorCount,
        critical: criticalCount,
      },
      last24Hours,
    };
  }

  /**
   * Get a single log by ID
   */
  async getLogById(id: string) {
    return this.prisma.systemLog.findUnique({
      where: { id },
    });
  }

  /**
   * Delete old logs (for cleanup)
   */
  async deleteOldLogs(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return {
      deleted: result.count,
      cutoffDate,
    };
  }
}
