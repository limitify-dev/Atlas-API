import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('students')
  @UseGuards(JwtAuthGuard)
  async getStudentsByClassroom(
    @Request() req: any,
    @Query('tenantId') tenantId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getStudentsByClassroom(
      effectiveTenantId,
      sectionId,
      gradeId,
      date,
    );
  }

  @Post('mark')
  @UseGuards(JwtAuthGuard)
  async markAttendance(
    @Request() req: any,
    @Body() data: {
      tenantId?: string;
      studentId: string;
      date: string;
      status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
      isManual: boolean;
      checkInTime?: string;
      remarks?: string;
    },
  ) {
    const effectiveTenantId = data.tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.markAttendance({
      ...data,
      tenantId: effectiveTenantId,
    });
  }

  @Post('auto-checkin')
  @UseGuards(DeviceApiKeyGuard)
  async autoCheckIn(
    @Request() req: any,
    @Body() data: {
      cardNumber: string;
      location?: string;
    },
  ) {
    // TenantId comes from the authenticated device
    return this.attendanceService.autoCheckIn({
      ...data,
      tenantId: req.tenantId,
    });
  }

  @Get('report')
  @UseGuards(JwtAuthGuard)
  async getAttendanceReport(
    @Request() req: any,
    @Query('tenantId') tenantId: string,
    @Query('date') date: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAttendanceReport(
      effectiveTenantId,
      date,
      sectionId,
      gradeId,
    );
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getAttendanceStats(
    @Request() req: any,
    @Query('tenantId') tenantId: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAttendanceStats(effectiveTenantId, date);
  }
}
