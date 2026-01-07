import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
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
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';
import { AutoCheckInDto, MarkAttendanceDto } from './dto';

@ApiTags('Attendance')
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
    @Request() req: any,
    @Body() data: MarkAttendanceDto,
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
        type: { type: 'string', enum: ['student', 'teacher'], example: 'student' },
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
        status: { type: 'string', enum: ['PRESENT', 'LATE'], example: 'PRESENT' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid date format or card not associated with user',
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
    @Request() req: any,
    @Body() data: AutoCheckInDto,
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
    return this.attendanceService.getAttendanceStats(effectiveTenantId);
  }
}
