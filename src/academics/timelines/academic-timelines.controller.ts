import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import {
  AcademicWindowStatus,
  AcademicWindowType,
  Role,
} from '../../../prisma/generated/client';
import { AcademicTimelinesService } from './academic-timelines.service';
import {
  AcademicTimelineFiltersDto,
  CreateAcademicTimelineDto,
  UpdateAcademicTimelineDto,
} from './dto';

/** Roles that can manage timelines — academics staff, DOS, and admins */
const MANAGE_ROLES = [Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF] as const;
/** Roles that can read timelines — includes teachers so they know when windows open */
const READ_ROLES = [...MANAGE_ROLES, Role.TEACHER] as const;

@ApiTags('Academics — Timelines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academics/timelines')
export class AcademicTimelinesController {
  constructor(private readonly timelinesService: AcademicTimelinesService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────────

  @Post()
  @Roles(...MANAGE_ROLES)
  @ApiOperation({
    summary: 'Create a new academic timeline window',
    description:
      'Creates in DRAFT status. Call /activate when ready to make it visible and enforceable.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAcademicTimelineDto) {
    return this.timelinesService.create(user.tenantId, dto, user.id);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────────

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List timeline windows — filter by type, status, year, term, or currently open' })
  @ApiQuery({ name: 'type', enum: AcademicWindowType, required: false })
  @ApiQuery({ name: 'status', enum: AcademicWindowStatus, required: false })
  @ApiQuery({ name: 'academicYear', required: false, example: '2024-2025' })
  @ApiQuery({ name: 'term', required: false, example: 'T1' })
  @ApiQuery({ name: 'currentOnly', required: false, type: Boolean, description: 'Only windows whose date range includes today' })
  findAll(@CurrentUser() user: AuthUser, @Query() filters: AcademicTimelineFiltersDto) {
    return this.timelinesService.findAll(user.tenantId, filters);
  }

  @Get('academic-years')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List all academic years that have at least one window configured' })
  getAcademicYears(@CurrentUser() user: AuthUser) {
    return this.timelinesService.getAcademicYears(user.tenantId);
  }

  @Get('current-status')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary: 'At-a-glance map of which window types are currently open',
    description:
      'Returns one entry per AcademicWindowType. Value is null when that type has no active window right now.',
  })
  getCurrentStatus(@CurrentUser() user: AuthUser) {
    return this.timelinesService.getCurrentStatus(user.tenantId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single timeline window by ID' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timelinesService.findOne(user.tenantId, id);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({
    summary: 'Update a timeline window',
    description: 'Allowed only on DRAFT and ACTIVE windows. Overlap is re-checked if dates or scope change.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicTimelineDto,
  ) {
    return this.timelinesService.update(user.tenantId, id, dto);
  }

  // ─── STATUS TRANSITIONS ───────────────────────────────────────────────────────

  @Patch(':id/activate')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({
    summary: 'Activate a DRAFT window → ACTIVE',
    description: 'Makes the window enforceable. Teachers will see it as open.',
  })
  activate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timelinesService.activate(user.tenantId, id);
  }

  @Patch(':id/close')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({
    summary: 'Manually close an ACTIVE window → CLOSED',
    description: 'Use when ending a window early. Closed windows are read-only.',
  })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timelinesService.close(user.tenantId, id);
  }

  @Patch(':id/cancel')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({
    summary: 'Cancel a DRAFT or ACTIVE window → CANCELLED',
    description: 'For windows that were set up in error. Cancelled windows are read-only.',
  })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timelinesService.cancel(user.tenantId, id);
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete a window (DRAFT or CANCELLED only)',
    description: 'Active and closed windows must be cancelled first.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timelinesService.remove(user.tenantId, id);
  }
}
