import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../../prisma/generated/client';
import { AcademicsService } from './academics.service';
import {
  CreateAcademicExamDto,
  CreateAcademicCourseDto,
  CreateAssignmentDto,
  CreateConsultationBookingDto,
  CreateReportCardDto,
  ListAcademicsQueryDto,
  UpsertTeacherAlignmentDto,
  UpdateAcademicExamDto,
  UpdateAcademicCourseDto,
  UpdateAssignmentDto,
  UpdateConsultationBookingDto,
  UpdateReportCardDto,
  UpsertAssignmentResultsDto,
} from './dto';

@ApiTags('Academics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academics')
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get('teacher-alignments/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS)
  @ApiOperation({ summary: 'Get teacher classroom/subject alignment' })
  getTeacherAlignment(
    @CurrentUser() user: AuthUser,
    @Param('teacherId') teacherId: string,
  ) {
    return this.academicsService.getTeacherAlignment(user.tenantId, teacherId);
  }

  @Put('teacher-alignments/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS)
  @ApiOperation({
    summary: 'Set teacher classroom/subject alignment (DOS workflow)',
  })
  upsertTeacherAlignment(
    @CurrentUser() user: AuthUser,
    @Param('teacherId') teacherId: string,
    @Body() dto: UpsertTeacherAlignmentDto,
  ) {
    return this.academicsService.upsertTeacherAlignment(
      user.tenantId,
      teacherId,
      dto,
    );
  }

  @Post('courses')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS)
  @ApiOperation({ summary: 'Create academic course' })
  createCourse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAcademicCourseDto,
  ) {
    return this.academicsService.createCourse(user.tenantId, user.id, dto);
  }

  @Get('courses')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List academic courses' })
  listCourses(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listCourses(user.tenantId, user, query);
  }

  @Patch('courses/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS)
  @ApiOperation({ summary: 'Update academic course' })
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicCourseDto,
  ) {
    return this.academicsService.updateCourse(user.tenantId, id, dto);
  }

  @Delete('courses/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DOS)
  @ApiOperation({ summary: 'Delete academic course' })
  deleteCourse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteCourse(user.tenantId, id);
  }

  @Post('exams')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Create exam schedule item' })
  createExam(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAcademicExamDto,
  ) {
    return this.academicsService.createExam(user.tenantId, user.id, dto);
  }

  @Get('exams')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List exam schedule items' })
  listExams(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listExams(user.tenantId, query);
  }

  @Patch('exams/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update exam schedule item' })
  updateExam(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicExamDto,
  ) {
    return this.academicsService.updateExam(user.tenantId, id, dto);
  }

  @Delete('exams/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Delete exam schedule item' })
  deleteExam(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteExam(user.tenantId, id);
  }

  @Post('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Create assignment' })
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.academicsService.createAssignment(user.tenantId, user, dto);
  }

  @Get('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List assignments' })
  listAssignments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listAssignments(user.tenantId, query);
  }

  @Patch('assignments/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update assignment' })
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.academicsService.updateAssignment(user.tenantId, id, dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Delete assignment' })
  deleteAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteAssignment(user.tenantId, id);
  }

  @Post('assignments/:id/results')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Upsert assignment results in bulk' })
  upsertAssignmentResults(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertAssignmentResultsDto,
  ) {
    return this.academicsService.upsertAssignmentResults(
      user.tenantId,
      user.id,
      id,
      dto,
    );
  }

  @Get('assignments/:id/results')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List assignment results' })
  getAssignmentResults(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.getAssignmentResults(user.tenantId, id);
  }

  @Post('report-cards')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Create or upsert report card' })
  createReportCard(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReportCardDto,
  ) {
    return this.academicsService.createReportCard(user.tenantId, user.id, dto);
  }

  @Get('report-cards')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List report cards' })
  listReportCards(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listReportCards(user.tenantId, query);
  }

  @Patch('report-cards/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update report card' })
  updateReportCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReportCardDto,
  ) {
    return this.academicsService.updateReportCard(
      user.tenantId,
      user.id,
      id,
      dto,
    );
  }

  @Delete('report-cards/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Delete report card' })
  deleteReportCard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteReportCard(user.tenantId, id);
  }

  @Post('consultations/bookings')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Create consultation booking with conflict check' })
  createConsultationBooking(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConsultationBookingDto,
  ) {
    return this.academicsService.createConsultationBooking(
      user.tenantId,
      user,
      dto,
    );
  }

  @Get('consultations/bookings')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @ApiOperation({ summary: 'List consultation bookings' })
  listConsultationBookings(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listConsultationBookings(user.tenantId, query);
  }

  @Patch('consultations/bookings/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Update consultation booking with conflict check' })
  updateConsultationBooking(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConsultationBookingDto,
  ) {
    return this.academicsService.updateConsultationBooking(
      user.tenantId,
      id,
      dto,
    );
  }

  @Delete('consultations/bookings/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Delete consultation booking' })
  deleteConsultationBooking(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteConsultationBooking(user.tenantId, id);
  }

  @Get('consultations/bookings/export.ics')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER, Role.PARENT)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="consultation-bookings.ics"',
  )
  @ApiOperation({ summary: 'Export consultation bookings as iCalendar (.ics)' })
  async exportConsultationBookingsIcs(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.exportConsultationBookingsIcs(
      user.tenantId,
      query,
    );
  }
}
