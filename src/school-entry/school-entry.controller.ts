import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';
import { Public } from '../auth/decorators/public.decorator';
import { RequireModule } from '../common/module-access/require-module.decorator';
import { SchoolEntryService } from './school-entry.service';
import { SchoolEntryAnalyticsService } from './school-entry-analytics.service';
import {
  ScanDto,
  BatchScanDto,
  ManualEntryDto,
  BulkManualEntryDto,
} from './dto';

@ApiTags('School Entry (campus check-in/out)')
@RequireModule('attendance')
@Controller('school-entry')
export class SchoolEntryController {
  constructor(
    private readonly service: SchoolEntryService,
    private readonly analytics: SchoolEntryAnalyticsService,
  ) {}

  // ─── Device / gate ─────────────────────────────────────────────────────────

  @Post('scan')
  @Public()
  @UseGuards(DeviceApiKeyGuard)
  @ApiSecurity('device-api-key')
  @ApiOperation({ summary: 'Record a gate scan (check-in, then check-out)' })
  async scan(
    @Request() req: { tenantId: string; device: { id: string } },
    @Body() dto: ScanDto,
  ) {
    return this.service.recordScanByCard({
      tenantId: req.tenantId,
      cardNumber: dto.cardNumber,
      at: new Date(dto.at),
      method: 'CARD',
      location: dto.location,
      // The authenticated device, not dto.deviceId — that's whatever
      // string the client puts in its own JSON body (Atlas-Edge sends its
      // configured device *name*, e.g. "edge-dev-laptop") and SchoolEntry
      // .deviceId is a real foreign key to Device.id (a UUID), so trusting
      // it threw a foreign-key violation (500) on every single scan.
      deviceId: req.device.id,
    });
  }

  @Post('batch')
  @Public()
  @UseGuards(DeviceApiKeyGuard)
  @ApiSecurity('device-api-key')
  @ApiOperation({ summary: 'Sync a batch of gate scans from an edge device' })
  async batch(
    @Request() req: { tenantId: string; device: { id: string } },
    @Body() dto: BatchScanDto,
  ) {
    const results = { processed: 0, failed: 0, errors: [] as string[] };
    for (const r of dto.records) {
      try {
        await this.service.recordScanByCard({
          tenantId: req.tenantId,
          cardNumber: r.cardNumber,
          at: new Date(r.at),
          method: 'DEVICE',
          location: r.location,
          deviceId: req.device.id,
        });
        results.processed += 1;
      } catch (e) {
        results.failed += 1;
        results.errors.push(
          e instanceof Error ? e.message : `Failed: ${r.cardNumber}`,
        );
      }
    }
    return results;
  }

  // ─── Teacher / staff / admin ──────────────────────────────────────────────

  @Post('mark')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manual school-entry record / override for a day' })
  async mark(@CurrentUser() user: AuthUser, @Body() dto: ManualEntryDto) {
    return this.service.manualUpsert({
      tenantId: user.tenantId,
      studentId: dto.studentId,
      date: dto.date,
      status: dto.status,
      checkInAt: dto.checkInAt,
      checkOutAt: dto.checkOutAt,
      remarks: dto.remarks,
      recordedBy: user.id,
      requestedByRole: user.role as Role,
    });
  }

  @Post('mark-bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk manual school-entry records for a day' })
  async markBulk(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkManualEntryDto,
  ) {
    return this.service.manualUpsertBulk({
      tenantId: user.tenantId,
      date: dto.date,
      recordedBy: user.id,
      requestedByRole: user.role as Role,
      records: dto.records,
    });
  }

  @Get('roster')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Day roster: every student + their entry (if any)' })
  @ApiQuery({ name: 'date', required: true })
  @ApiQuery({ name: 'sectionId', required: false })
  @ApiQuery({ name: 'gradeId', required: false })
  async roster(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string,
    @Query('sectionId') sectionId?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    return this.service.getDayRoster({
      tenantId: user.tenantId,
      date: date || new Date().toISOString().slice(0, 10),
      sectionId,
      gradeId,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List school-entry records (paginated)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list({
      tenantId: user.tenantId,
      from,
      to,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('student/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent school-entry history for one student' })
  async forStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getForStudent(
      user.tenantId,
      studentId,
      limit ? Number(limit) : undefined,
    );
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async overview(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getOverview(
      user.tenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/trend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async trend(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.analytics.getTrend(
      user.tenantId,
      days ? Math.min(Number(days), 60) : 14,
    );
  }

  @Get('analytics/classrooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async classrooms(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getClassroomAnalytics(
      user.tenantId,
      period || 'month',
      startDate,
      endDate,
    );
  }

  @Get('analytics/classroom-report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Per-classroom campus attendance by gender + overall (printable)',
  })
  async classroomReport(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gradeId') gradeId?: string,
  ) {
    return this.analytics.getClassroomGenderReport(
      user.tenantId,
      period || 'month',
      startDate,
      endDate,
      gradeId,
    );
  }

  @Get('analytics/student/:studentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async studentAnalytics(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analytics.getStudentAnalytics(
      user.tenantId,
      studentId,
      period || 'month',
      startDate,
      endDate,
    );
  }
}
