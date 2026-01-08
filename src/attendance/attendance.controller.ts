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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';
import { AutoCheckInDto, MarkAttendanceDto } from './dto';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly analyticsService: AttendanceAnalyticsService,
  ) {}

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
  async markAttendance(@Request() req: any, @Body() data: MarkAttendanceDto) {
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
    });
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
  async autoCheckIn(@Request() req: any, @Body() data: AutoCheckInDto) {
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
    @Request() req: any,
    @Query('tenantId') tenantId?: string,
    @Query('date') date?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.attendanceService.getAllTeachers(effectiveTenantId, date);
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
    @Request() req: any,
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
    @Request() req: any,
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
  // ANALYTICS ENDPOINTS
  // ============================================

  @Get('analytics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get attendance analytics overview',
    description: 'Retrieve comprehensive attendance analytics overview with key metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false, description: 'Period: today, week, month, quarter, year, custom' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Custom start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Custom end date (YYYY-MM-DD)' })
  async getAnalyticsOverview(
    @Request() req: any,
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
    @Request() req: any,
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
    description: 'Retrieve attendance analytics for all classrooms with comparison metrics',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getClassroomAnalytics(
    @Request() req: any,
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
    description: 'Retrieve attendance analytics for all students with filtering options',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  async getAllStudentsAnalytics(
    @Request() req: any,
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
    description: 'Retrieve detailed attendance analytics for a specific student',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getStudentAnalytics(
    @Request() req: any,
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
    description: 'Retrieve students with attendance below the specified threshold',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'threshold', required: false, description: 'Attendance rate threshold (default: 85)' })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAtRiskStudents(
    @Request() req: any,
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
  @ApiQuery({ name: 'limit', required: false, description: 'Number of students to return (default: 10)' })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTopPerformers(
    @Request() req: any,
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
    @Request() req: any,
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
  @ApiQuery({ name: 'months', required: false, description: 'Number of months to compare (default: 6)' })
  async getMonthlyComparison(
    @Request() req: any,
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
  @ApiQuery({ name: 'reportType', required: true, description: 'Report type: summary, detailed, classroom, student' })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  async generateReport(
    @Request() req: any,
    @Query('tenantId') tenantId?: string,
    @Query('reportType') reportType?: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sectionId') sectionId?: string,
    @Query('studentId') studentId?: string,
  ) {
    const effectiveTenantId = tenantId || req.user.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    return this.analyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'classroom' | 'student') || 'summary',
      period || 'month',
      startDate,
      endDate,
      sectionId,
      studentId,
    );
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
    @Request() req: any,
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

    const reportData = await this.analyticsService.generateReportData(
      effectiveTenantId,
      (reportType as 'summary' | 'detailed' | 'classroom' | 'student') || 'summary',
      period || 'month',
      startDate,
      endDate,
      sectionId,
    );

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add overview sheet if available
    if (reportData.overview) {
      const overviewData = [
        ['Attendance Report Overview'],
        ['Generated At', reportData.generatedAt],
        ['School', reportData.schoolName],
        ['Period', `${reportData.period.start} to ${reportData.period.end}`],
        [],
        ['Metric', 'Value'],
        ['Total Students', reportData.overview.totalStudents],
        ['Average Attendance Rate', `${reportData.overview.averageAttendanceRate}%`],
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
      const classroomData = [
        ['Grade', 'Section', 'Total Students', 'Present', 'Absent', 'Late', 'Excused', 'Attendance Rate', 'Trend'],
        ...reportData.classrooms.map((c: any) => [
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
      const studentData = [
        ['Student ID', 'Name', 'Grade', 'Section', 'Total Days', 'Present', 'Absent', 'Late', 'Excused', 'Attendance Rate', 'Risk Level'],
        ...reportData.students.map((s: any) => [
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
      const atRiskData = [
        ['Student ID', 'Name', 'Grade', 'Section', 'Attendance Rate', 'Last Absence'],
        ...reportData.atRiskStudents.map((s: any) => [
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
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers and send
    const filename = `attendance_report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
