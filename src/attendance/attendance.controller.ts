import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { AuthUser as CurrentAuthUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { AttendanceService } from './attendance.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { TeacherAttendanceAnalyticsService } from './teacher-attendance-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';
import {
  AutoCheckInDto,
  MarkAttendanceDto,
  BatchAttendanceDto,
  BulkMarkAttendanceDto,
} from './dto';

type AuthUser = { user: CurrentAuthUser };
type ExcelCell = string | number | boolean | null;

type TeacherReportOverview = {
  totalTeachers: number;
  averageAttendanceRate: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  teachersAtRisk: number;
  perfectAttendanceCount: number;
  averageWorkHoursToday?: number | null;
};

type TeacherDepartmentRow = {
  department: string;
  totalTeachers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
  trend: string;
  trendPercentage: number;
};

type TeacherRow = {
  teacherId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  department?: string | null;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  attendanceRate: number;
  riskLevel: string;
};

type AtRiskTeacherRow = {
  teacherId: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  attendanceRate: number;
  lastAbsenceDate?: string | null;
};

type TeacherReportExportData = {
  generatedAt: string;
  schoolName: string;
  period: { start: string; end: string };
  overview?: TeacherReportOverview;
  departments?: TeacherDepartmentRow[];
  teachers?: TeacherRow[];
  atRiskTeachers?: AtRiskTeacherRow[];
};

type StudentReportOverview = {
  totalStudents: number;
  averageAttendanceRate: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  studentsAtRisk: number;
  perfectAttendanceCount: number;
};

type ClassroomRow = {
  gradeName: string;
  sectionName: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number;
  trend: string;
  trendPercentage: number;
};

type StudentRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  gradeName: string;
  sectionName: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  attendanceRate: number;
  riskLevel: string;
};

type AtRiskStudentRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  gradeName: string;
  sectionName: string;
  attendanceRate: number;
  lastAbsenceDate?: string | null;
};

type StudentReportExportData = {
  generatedAt: string;
  schoolName: string;
  period: { start: string; end: string };
  overview?: StudentReportOverview;
  classrooms?: ClassroomRow[];
  students?: StudentRow[];
  atRiskStudents?: AtRiskStudentRow[];
};

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly analyticsService: AttendanceAnalyticsService,
    private readonly teacherAnalyticsService: TeacherAttendanceAnalyticsService,
  ) {}

  @Get('students')
  @UseGuards(JwtAuthGuard)
  async getStudentsByClassroom(
    @Request() req: AuthUser,
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark student attendance manually',
    description: 'Manually create or update attendance record for a student',
  })
  @ApiBody({ type: MarkAttendanceDto })
  @ApiResponse({
    status: 201,
    description: 'Attendance marked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid date format',
  })
  @ApiResponse({
    status: 404,
    description: 'Student not found',
  })
  async markAttendance(
    @Request() req: AuthUser,
    @Body() data: MarkAttendanceDto,
  ): Promise<unknown> {
    const effectiveTenantId = data.tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.markAttendance({
      tenantId: effectiveTenantId,
      studentId: data.studentId,
      status: data.status,
      isManual: data.isManual,
      checkInTime: data.checkInTime,
      checkInDateTime: data.checkInDateTime
        ? new Date(data.checkInDateTime)
        : undefined,
      remarks: data.remarks,
    }) as Promise<unknown>;
  }

  @Post('mark-bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bulk mark student attendance manually',
    description: 'Mark attendance for multiple students at once',
  })
  @ApiBody({ type: BulkMarkAttendanceDto })
  @ApiResponse({
    status: 201,
    description: 'Attendance marked successfully for all students',
  })
  async markBulkAttendance(
    @Request() req: AuthUser,
    @Body() data: BulkMarkAttendanceDto,
  ) {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.markBulkAttendance(tenantId, data.records);
  }

  @Get('records')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get attendance records',
    description: 'Get flat list of attendance records with optional filters',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format',
  })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getAttendanceRecords(
    @Request() req: AuthUser,
    @Query('date') date?: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAttendanceRecords(
      tenantId,
      date,
      sectionId,
      gradeId,
      page || 1,
      limit || 100,
    );
  }

  @Post('auto-checkin')
  @UseGuards(DeviceApiKeyGuard)
  @ApiSecurity('device-api-key')
  @ApiOperation({
    summary: 'Auto check-in via external device',
    description: `
      Processes automatic attendance check-in from external card scanning devices.

      **Date Format:** ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
      - Example: 2024-01-15T08:30:00.000Z
      - The date field should contain the exact timestamp from the external device
      - The timestamp is used to determine if the student is late (after 8:00 AM)

      **Authentication:** Requires device API key in X-API-Key header

      **Behavior:**
      - Validates the card and checks if it's active
      - Automatically determines attendance status (PRESENT or LATE) based on time
      - Creates attendance record for students or logs entry for teachers
      - Records the check-in in the card usage log
      - Updates the card's last used timestamp
    `,
  })
  @ApiBody({
    type: AutoCheckInDto,
    description: 'Auto check-in data from external device',
    examples: {
      'Student Check-in': {
        value: {
          cardNumber: 'CARD-12345',
          date: '2024-01-15T07:45:00.000Z',
          location: 'entrance',
        },
        description: 'Early arrival - will be marked as PRESENT',
      },
      'Late Check-in': {
        value: {
          cardNumber: 'CARD-67890',
          date: '2024-01-15T08:15:00.000Z',
          location: 'main gate',
        },
        description: 'After 8:00 AM - will be marked as LATE',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Check-in processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        type: {
          type: 'string',
          enum: ['student', 'teacher'],
          example: 'student',
        },
        attendance: {
          type: 'object',
          description: 'Attendance record (for students only)',
        },
        student: {
          type: 'object',
          description: 'Student information (for students only)',
        },
        teacher: {
          type: 'object',
          description: 'Teacher information (for teachers only)',
        },
        checkInTime: { type: 'string', example: '07:45' },
        status: {
          type: 'string',
          enum: ['PRESENT', 'LATE'],
          example: 'PRESENT',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Invalid date format or card not associated with user',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing device API key',
  })
  @ApiResponse({
    status: 404,
    description: 'Card not found or inactive',
  })
  async autoCheckIn(
    @Request() req: { tenantId: string },
    @Body() data: AutoCheckInDto,
  ) {
    // TenantId comes from the authenticated device
    return this.attendanceService.autoCheckIn({
      ...data,
      tenantId: req.tenantId,
    });
  }

  /**
   * Batch auto check-in endpoint for Atlas-Edge devices
   * Processes multiple attendance records from offline storage sync
   */
  @Post('batch')
  @UseGuards(DeviceApiKeyGuard)
  @ApiSecurity('device-api-key')
  @ApiOperation({
    summary: 'Batch auto check-in from Edge device',
    description: `
      Processes multiple attendance records from Atlas-Edge devices.
      Used for syncing offline-stored attendance records.

      **Authentication:** Requires device API key in Authorization header (Bearer token)

      **Record Format:** Each record should contain:
      - card_id: The RFID card number
      - timestamp: ISO 8601 format timestamp
      - device_id: Optional device identifier
      - location: Optional location string
    `,
  })
  @ApiBody({
    type: BatchAttendanceDto,
    description: 'Batch of attendance records from Edge device',
  })
  @ApiResponse({
    status: 201,
    description: 'Batch processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Batch processed' },
        count: { type: 'number', example: 45 },
        results: {
          type: 'object',
          properties: {
            successful: { type: 'number', example: 43 },
            failed: { type: 'number', example: 2 },
            records: { type: 'array' },
          },
        },
      },
    },
  })
  async batchAutoCheckIn(
    @Request()
    req: {
      tenantId: string;
    },
    @Body() data: BatchAttendanceDto,
  ) {
    const tenantId: string = req.tenantId;
    const results = {
      successful: 0,
      failed: 0,
      records: [] as any[],
      errors: [] as any[],
    };

    for (const record of data.records) {
      try {
        // Map Edge format to backend format
        const result = await this.attendanceService.autoCheckIn({
          cardNumber: record.card_id,
          date: record.timestamp,
          location: record.location || record.device_name || 'Edge Device',
          tenantId,
        });

        results.successful++;
        results.records.push({
          card_id: record.card_id,
          timestamp: record.timestamp,
          success: true,
          type: result.type,
          status: result.status,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.failed++;
        results.errors.push({
          card_id: record.card_id,
          timestamp: record.timestamp,
          success: false,
          error: message,
        });
      }
    }

    return {
      success: true,
      message: 'Batch processed',
      count: data.records.length,
      results,
    };
  }

  @Get('report')
  @UseGuards(JwtAuthGuard)
  async getAttendanceReport(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId: string,
    @Query('date') date?: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAttendanceReport(
      effectiveTenantId,
      sectionId,
      gradeId,
      date,
    );
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getAttendanceStats(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAttendanceStats(effectiveTenantId, date);
  }

  // Teacher Attendance Endpoints
  @Get('teachers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all teachers with attendance',
    description:
      'Retrieve all teachers with their attendance status for a given date',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format',
  })
  async getTeachers(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAllTeachers(
      effectiveTenantId,
      date,
      page,
      pageSize,
    );
  }

  @Get('teachers/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get teacher attendance report',
    description: 'Retrieve teacher attendance records for a given date',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format',
  })
  async getTeacherAttendanceReport(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getTeacherAttendanceReport(
      effectiveTenantId,
      date,
    );
  }

  @Get('teachers/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get teacher attendance statistics',
    description: 'Retrieve teacher attendance statistics for a given date',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format',
  })
  async getTeacherAttendanceStats(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getTeacherAttendanceStats(
      effectiveTenantId,
      date,
    );
  }

  // ============================================
  // TEACHER ANALYTICS ENDPOINTS
  // ============================================

  @Get('teachers/analytics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get teacher attendance analytics overview',
    description:
      'Retrieve comprehensive teacher attendance analytics overview with key metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Period: today, week, month, quarter, year, custom',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTeacherAnalyticsOverview(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getOverviewAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/trend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get teacher attendance trend data',
    description:
      'Retrieve daily teacher attendance trend data for visualization',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTeacherAnalyticsTrend(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getAttendanceTrend(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/departments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get department-wise teacher attendance analytics',
    description:
      'Retrieve attendance analytics for all departments with comparison metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getDepartmentAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getDepartmentAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all teachers attendance analytics',
    description:
      'Retrieve attendance analytics for all teachers with filtering options',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'department', required: false })
  async getAllTeachersAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getAllTeachersAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
      department,
    );
  }

  @Get('teachers/analytics/teacher/:teacherId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get individual teacher attendance analytics',
    description:
      'Retrieve detailed attendance analytics for a specific teacher',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTeacherAnalytics(
    @Request() req: AuthUser,
    @Param('teacherId') teacherId: string,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getTeacherAnalytics(
      effectiveTenantId,
      teacherId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/at-risk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get at-risk teachers',
    description:
      'Retrieve teachers with attendance below the specified threshold',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'threshold',
    required: false,
    description: 'Attendance rate threshold (default: 85)',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAtRiskTeachers(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('threshold') threshold?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getAtRiskTeachers(
      effectiveTenantId,
      threshold ? parseInt(threshold, 10) : 85,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/top-performers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get top performing teachers',
    description: 'Retrieve teachers with the best attendance records',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of teachers to return (default: 10)',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTopPerformingTeachers(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getTopPerformers(
      effectiveTenantId,
      limit ? parseInt(limit, 10) : 10,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('teachers/analytics/day-of-week')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get day of week teacher attendance analytics',
    description: 'Retrieve average teacher attendance rates by day of week',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  async getTeacherDayOfWeekAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getDayOfWeekAnalytics(
      effectiveTenantId,
      period || 'quarter',
    );
  }

  @Get('teachers/analytics/monthly-comparison')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get monthly teacher attendance comparison',
    description: 'Retrieve teacher attendance rates comparison across months',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'months',
    required: false,
    description: 'Number of months to compare (default: 6)',
  })
  async getTeacherMonthlyComparison(
    @Request()
    req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('months') months?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.getMonthlyComparison(
      effectiveTenantId,
      months ? parseInt(months, 10) : 6,
    );
  }

  @Get('teachers/analytics/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate teacher attendance report data',
    description: 'Generate comprehensive teacher report data for export',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'reportType',
    required: true,
    description: 'Report type: summary, detailed, department, teacher',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'teacherId', required: false })
  async generateTeacherReport(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('reportType') reportType?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
    @Query('teacherId') teacherId?: string,
  ): Promise<unknown> {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.teacherAnalyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'department' | 'teacher') ||
        'summary',
      period || 'month',
      startDate,
      endDate,
      department,
      teacherId,
    ) as Promise<unknown>;
  }

  @Get('teachers/analytics/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export teacher attendance report as Excel',
    description: 'Download teacher attendance report in Excel format',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'reportType', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'department', required: false })
  async exportTeacherReport(
    @Request()
    req: AuthUser,
    @Res() res: Response,
    @Query('tenantId') tenantId?: string,
    @Query('reportType') reportType?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }

    const reportData = (await this.teacherAnalyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'department' | 'teacher') ||
        'summary',
      period || 'month',
      startDate,
      endDate,
      department,
    )) as TeacherReportExportData;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add overview sheet if available
    if (reportData.overview) {
      const overviewData: ExcelCell[][] = [
        ['Teacher Attendance Report Overview'],
        ['Generated At', reportData.generatedAt],
        ['School', reportData.schoolName],
        ['Period', `${reportData.period.start} to ${reportData.period.end}`],
        [],
        ['Metric', 'Value'],
        ['Total Teachers', reportData.overview.totalTeachers],
        [
          'Average Attendance Rate',
          `${reportData.overview.averageAttendanceRate}%`,
        ],
        ['Present Today', reportData.overview.presentToday],
        ['Absent Today', reportData.overview.absentToday],
        ['Late Today', reportData.overview.lateToday],
        ['Teachers At Risk', reportData.overview.teachersAtRisk],
        ['Perfect Attendance', reportData.overview.perfectAttendanceCount],
        [
          'Average Work Hours Today',
          reportData.overview.averageWorkHoursToday
            ? `${reportData.overview.averageWorkHoursToday} hrs`
            : 'N/A',
        ],
      ];
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
    }

    // Add departments sheet if available
    if (reportData.departments && reportData.departments.length > 0) {
      const departmentData: ExcelCell[][] = [
        [
          'Department',
          'Total Teachers',
          'Present',
          'Absent',
          'Late',
          'Excused',
          'Attendance Rate',
          'Trend',
        ],
        ...reportData.departments.map((d) => [
          d.department,
          d.totalTeachers,
          d.presentCount,
          d.absentCount,
          d.lateCount,
          d.excusedCount,
          `${d.attendanceRate}%`,
          `${d.trend} (${d.trendPercentage > 0 ? '+' : ''}${d.trendPercentage}%)`,
        ]),
      ];
      const departmentSheet = XLSX.utils.aoa_to_sheet(departmentData);
      XLSX.utils.book_append_sheet(workbook, departmentSheet, 'Departments');
    }

    // Add teachers sheet if available
    if (reportData.teachers && reportData.teachers.length > 0) {
      const teacherData: ExcelCell[][] = [
        [
          'Teacher ID',
          'Name',
          'Email',
          'Department',
          'Total Days',
          'Present',
          'Absent',
          'Late',
          'Excused',
          'Attendance Rate',
          'Risk Level',
        ],
        ...reportData.teachers.map((t) => [
          t.teacherId,
          `${t.firstName} ${t.lastName}`,
          t.email || 'N/A',
          t.department || 'Unassigned',
          t.totalDays,
          t.presentDays,
          t.absentDays,
          t.lateDays,
          t.excusedDays,
          `${t.attendanceRate}%`,
          t.riskLevel,
        ]),
      ];
      const teacherSheet = XLSX.utils.aoa_to_sheet(teacherData);
      XLSX.utils.book_append_sheet(workbook, teacherSheet, 'Teachers');
    }

    // Add at-risk teachers sheet if available
    if (reportData.atRiskTeachers && reportData.atRiskTeachers.length > 0) {
      const atRiskData: ExcelCell[][] = [
        ['Teacher ID', 'Name', 'Department', 'Attendance Rate', 'Last Absence'],
        ...reportData.atRiskTeachers.map((t) => [
          t.teacherId,
          `${t.firstName} ${t.lastName}`,
          t.department || 'Unassigned',
          `${t.attendanceRate}%`,
          t.lastAbsenceDate || 'N/A',
        ]),
      ];
      const atRiskSheet = XLSX.utils.aoa_to_sheet(atRiskData);
      XLSX.utils.book_append_sheet(workbook, atRiskSheet, 'At Risk Teachers');
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    // Set headers and send
    const filename = `teacher_attendance_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // ============================================
  // STUDENT ANALYTICS ENDPOINTS
  // ============================================

  @Get('analytics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get attendance analytics overview',
    description:
      'Retrieve comprehensive attendance analytics overview with key metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Period: today, week, month, quarter, year, custom',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  async getAnalyticsOverview(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getOverviewAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/trend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get attendance trend data',
    description: 'Retrieve daily attendance trend data for visualization',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAnalyticsTrend(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getAttendanceTrend(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/classrooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get classroom-wise attendance analytics',
    description:
      'Retrieve attendance analytics for all classrooms with comparison metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getClassroomAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getClassroomAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/students')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all students attendance analytics',
    description:
      'Retrieve attendance analytics for all students with filtering options',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  async getAllStudentsAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getAllStudentsAnalytics(
      effectiveTenantId,
      period || 'month',
      startDate,
      endDate,
      sectionId,
      gradeId,
    );
  }

  @Get('analytics/student/:studentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get individual student attendance analytics',
    description:
      'Retrieve detailed attendance analytics for a specific student',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getStudentAnalytics(
    @Request() req: AuthUser,
    @Param('studentId') studentId: string,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getStudentAnalytics(
      effectiveTenantId,
      studentId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/at-risk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get at-risk students',
    description:
      'Retrieve students with attendance below the specified threshold',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'threshold',
    required: false,
    description: 'Attendance rate threshold (default: 85)',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAtRiskStudents(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('threshold') threshold?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getAtRiskStudents(
      effectiveTenantId,
      threshold ? parseInt(threshold, 10) : 85,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/top-performers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get top performing students',
    description: 'Retrieve students with the best attendance records',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of students to return (default: 10)',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTopPerformers(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getTopPerformers(
      effectiveTenantId,
      limit ? parseInt(limit, 10) : 10,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/day-of-week')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get day of week attendance analytics',
    description: 'Retrieve average attendance rates by day of week',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  async getDayOfWeekAnalytics(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('period') period?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getDayOfWeekAnalytics(
      effectiveTenantId,
      period || 'quarter',
    );
  }

  @Get('analytics/monthly-comparison')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get monthly attendance comparison',
    description: 'Retrieve attendance rates comparison across months',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'months',
    required: false,
    description: 'Number of months to compare (default: 6)',
  })
  async getMonthlyComparison(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('months') months?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.getMonthlyComparison(
      effectiveTenantId,
      months ? parseInt(months, 10) : 6,
    );
  }

  @Get('analytics/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate attendance report data',
    description: 'Generate comprehensive report data for export',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'reportType',
    required: true,
    description: 'Report type: summary, detailed, classroom, student',
  })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  async generateReport(
    @Request() req: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('reportType') reportType?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sectionId') sectionId?: string,
    @Query('studentId') studentId?: string,
  ): Promise<unknown> {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'classroom' | 'student') ||
        'summary',
      period || 'month',
      startDate,
      endDate,
      sectionId,
      studentId,
    ) as Promise<unknown>;
  }

  @Get('analytics/export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export attendance report as Excel',
    description: 'Download attendance report in Excel format',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'reportType', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  async exportReport(
    @Request() req: AuthUser,
    @Res() res: Response,
    @Query('tenantId') tenantId?: string,
    @Query('reportType') reportType?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }

    const reportData = (await this.analyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'classroom' | 'student') ||
        'summary',
      period || 'month',
      startDate,
      endDate,
      sectionId,
    )) as StudentReportExportData;

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add overview sheet if available
    if (reportData.overview) {
      const overviewData: ExcelCell[][] = [
        ['Attendance Report Overview'],
        ['Generated At', reportData.generatedAt],
        ['School', reportData.schoolName],
        ['Period', `${reportData.period.start} to ${reportData.period.end}`],
        [],
        ['Metric', 'Value'],
        ['Total Students', reportData.overview.totalStudents],
        [
          'Average Attendance Rate',
          `${reportData.overview.averageAttendanceRate}%`,
        ],
        ['Present Today', reportData.overview.presentToday],
        ['Absent Today', reportData.overview.absentToday],
        ['Late Today', reportData.overview.lateToday],
        ['Students At Risk', reportData.overview.studentsAtRisk],
        ['Perfect Attendance', reportData.overview.perfectAttendanceCount],
      ];
      const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
    }

    // Add classrooms sheet if available
    if (reportData.classrooms && reportData.classrooms.length > 0) {
      const classroomData: ExcelCell[][] = [
        [
          'Grade',
          'Section',
          'Total Students',
          'Present',
          'Absent',
          'Late',
          'Excused',
          'Attendance Rate',
          'Trend',
        ],
        ...reportData.classrooms.map((c) => [
          c.gradeName,
          c.sectionName,
          c.totalStudents,
          c.presentCount,
          c.absentCount,
          c.lateCount,
          c.excusedCount,
          `${c.attendanceRate}%`,
          `${c.trend} (${c.trendPercentage > 0 ? '+' : ''}${c.trendPercentage}%)`,
        ]),
      ];
      const classroomSheet = XLSX.utils.aoa_to_sheet(classroomData);
      XLSX.utils.book_append_sheet(workbook, classroomSheet, 'Classrooms');
    }

    // Add students sheet if available
    if (reportData.students && reportData.students.length > 0) {
      const studentData: ExcelCell[][] = [
        [
          'Student ID',
          'Name',
          'Grade',
          'Section',
          'Total Days',
          'Present',
          'Absent',
          'Late',
          'Excused',
          'Attendance Rate',
          'Risk Level',
        ],
        ...reportData.students.map((s) => [
          s.studentId,
          `${s.firstName} ${s.lastName}`,
          s.gradeName,
          s.sectionName,
          s.totalDays,
          s.presentDays,
          s.absentDays,
          s.lateDays,
          s.excusedDays,
          `${s.attendanceRate}%`,
          s.riskLevel,
        ]),
      ];
      const studentSheet = XLSX.utils.aoa_to_sheet(studentData);
      XLSX.utils.book_append_sheet(workbook, studentSheet, 'Students');
    }

    // Add at-risk students sheet if available
    if (reportData.atRiskStudents && reportData.atRiskStudents.length > 0) {
      const atRiskData: ExcelCell[][] = [
        [
          'Student ID',
          'Name',
          'Grade',
          'Section',
          'Attendance Rate',
          'Last Absence',
        ],
        ...reportData.atRiskStudents.map((s) => [
          s.studentId,
          `${s.firstName} ${s.lastName}`,
          s.gradeName,
          s.sectionName,
          `${s.attendanceRate}%`,
          s.lastAbsenceDate || 'N/A',
        ]),
      ];
      const atRiskSheet = XLSX.utils.aoa_to_sheet(atRiskData);
      XLSX.utils.book_append_sheet(workbook, atRiskSheet, 'At Risk Students');
    }

    // Generate buffer
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    // Set headers and send
    const filename = `attendance_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
