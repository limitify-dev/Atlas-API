import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../prisma/generated/client';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TimetableService } from './timetable.service';
import {
  BulkSetPeriodsDto,
  CreateEntryDto,
  CreatePeriodDto,
  EntryFiltersDto,
  UpdateEntryDto,
  UpdatePeriodDto,
} from './dto';

@ApiTags('Timetable')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  // ─── Periods (admin-customizable slots) ─────────────────────────────────────

  @Get('periods')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'List the tenant timetable periods' })
  listPeriods(@CurrentUser() user: AuthUser) {
    return this.timetableService.listPeriods(user.tenantId);
  }

  @Post('periods')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a timetable period' })
  createPeriod(@CurrentUser() user: AuthUser, @Body() dto: CreatePeriodDto) {
    return this.timetableService.createPeriod(user.tenantId, dto);
  }

  @Put('periods')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Replace the entire set of timetable periods' })
  bulkSetPeriods(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkSetPeriodsDto,
  ) {
    return this.timetableService.bulkSetPeriods(user.tenantId, dto);
  }

  @Patch('periods/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update a timetable period' })
  updatePeriod(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePeriodDto,
  ) {
    return this.timetableService.updatePeriod(user.tenantId, id, dto);
  }

  @Delete('periods/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Delete a timetable period' })
  removePeriod(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.timetableService.removePeriod(user.tenantId, id);
  }

  // ─── Entries ────────────────────────────────────────────────────────────────

  @Get('my')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get the current teacher own timetable' })
  getMyTimetable(@CurrentUser() user: AuthUser) {
    return this.timetableService.getMyTimetable(user.id, user.tenantId);
  }

  @Get('entries')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'List timetable entries, filtered by section/teacher/day',
  })
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query() filters: EntryFiltersDto,
  ) {
    return this.timetableService.listEntries(user.tenantId, filters);
  }

  @Post('entries')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'Create a timetable entry (collision-checked)' })
  createEntry(@CurrentUser() user: AuthUser, @Body() dto: CreateEntryDto) {
    // Teachers may only schedule their own classes/subjects
    const restrictUserId = user.role === Role.TEACHER ? user.id : undefined;
    return this.timetableService.createEntry(
      user.tenantId,
      dto,
      restrictUserId,
    );
  }

  @Patch('entries/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'Update a timetable entry (collision-checked)' })
  updateEntry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
  ) {
    const restrictUserId = user.role === Role.TEACHER ? user.id : undefined;
    return this.timetableService.updateEntry(
      user.tenantId,
      id,
      dto,
      restrictUserId,
    );
  }

  @Delete('entries/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({ summary: 'Delete a timetable entry' })
  removeEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const restrictUserId = user.role === Role.TEACHER ? user.id : undefined;
    return this.timetableService.removeEntry(user.tenantId, id, restrictUserId);
  }
}
