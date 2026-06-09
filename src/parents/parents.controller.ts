import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ParentsService } from './parents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get('my-children')
  @Roles(Role.STAFF)
  async getMyChildren(@CurrentUser() user: AuthUser) {
    return this.parentsService.getMyChildren(user.id, user.tenantId);
  }

  @Get('my-financials')
  @Roles(Role.STAFF)
  async getMyFinancials(@CurrentUser() user: AuthUser) {
    return this.parentsService.getMyFinancials(user.id, user.tenantId);
  }

  @Get('exam-schedule')
  @Roles(Role.STAFF)
  async getMyExamSchedule(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parentsService.getMyExamSchedule(user.id, user.tenantId, {
      studentId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('report-cards')
  @Roles(Role.STAFF)
  async getMyReportCards(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parentsService.getMyReportCards(user.id, user.tenantId, {
      studentId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('assignments')
  @Roles(Role.STAFF)
  async getMyAssignments(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parentsService.getMyAssignments(user.id, user.tenantId, {
      studentId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('consultation-slots')
  @Roles(Role.STAFF)
  async getMyConsultationSlots(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parentsService.getMyConsultationSlots(user.id, user.tenantId, {
      studentId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
