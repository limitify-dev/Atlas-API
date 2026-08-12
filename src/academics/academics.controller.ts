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
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  UpsertConsultationConfigDto,
} from './dto';

@ApiTags('Academics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academics')
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get('teacher-alignments/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get teacher classroom/subject alignment' })
  getTeacherAlignment(
    @CurrentUser() user: AuthUser,
    @Param('teacherId') teacherId: string,
  ) {
    return this.academicsService.getTeacherAlignment(user.tenantId, teacherId);
  }

  @Get('teacher-alignments/me/subjects')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Get current teacher\'s subject IDs for a section' })
  getMySubjects(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId: string,
  ) {
    return this.academicsService.getMySubjectsForSection(user.tenantId, user, sectionId);
  }

  @Put('teacher-alignments/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
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

  @Put('class-teacher')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Set or clear the class teacher (homeroom) of a section. teacherId null clears it.',
  })
  setClassTeacher(
    @CurrentUser() user: AuthUser,
    @Body() body: { sectionId: string; teacherId?: string | null },
  ) {
    return this.academicsService.setClassTeacher(
      user.tenantId,
      body.sectionId,
      body.teacherId ?? null,
    );
  }

  @Post('courses')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create academic course' })
  createCourse(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAcademicCourseDto,
  ) {
    return this.academicsService.createCourse(user.tenantId, user.id, dto);
  }

  @Get('courses')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List academic courses' })
  listCourses(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listCourses(user.tenantId, user, query);
  }

  @Patch('courses/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update academic course' })
  updateCourse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicCourseDto,
  ) {
    return this.academicsService.updateCourse(user.tenantId, id, dto);
  }

  @Delete('courses/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Delete academic course' })
  deleteCourse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteCourse(user.tenantId, id);
  }

  @Post('exams')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Create exam schedule item' })
  createExam(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAcademicExamDto,
  ) {
    return this.academicsService.createExam(user.tenantId, user.id, dto);
  }

  @Get('exams')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List exam schedule items' })
  listExams(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listExams(user.tenantId, query);
  }

  @Patch('exams/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Update exam schedule item' })
  updateExam(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAcademicExamDto,
  ) {
    return this.academicsService.updateExam(user.tenantId, id, dto);
  }

  @Delete('exams/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Delete exam schedule item' })
  deleteExam(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteExam(user.tenantId, id);
  }

  @Post('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Create assignment' })
  createAssignment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.academicsService.createAssignment(user.tenantId, user, dto);
  }

  @Get('assignments')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List assignments' })
  listAssignments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listAssignments(user.tenantId, user, query);
  }

  @Patch('assignments/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Update assignment' })
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.academicsService.updateAssignment(user.tenantId, user, id, dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Delete assignment' })
  deleteAssignment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteAssignment(user.tenantId, user, id);
  }

  @Post('assignments/:id/results')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Upsert assignment results in bulk' })
  upsertAssignmentResults(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertAssignmentResultsDto,
  ) {
    return this.academicsService.upsertAssignmentResults(
      user.tenantId,
      user,
      id,
      dto,
    );
  }

  @Get('assignments/:id/results')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List assignment results' })
  getAssignmentResults(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.getAssignmentResults(user.tenantId, user, id);
  }

  @Get('students')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({
    summary: 'Get students in a section (teachers: own sections only)',
  })
  getStudentsInSection(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId: string,
  ) {
    return this.academicsService.getStudentsInSection(
      user.tenantId,
      user,
      sectionId,
    );
  }

  @Post('grades/bulk')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Bulk upsert student term grades' })
  bulkUpsertStudentGrades(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      subjectId: string;
      sectionId: string;
      term: string;
      grades: Array<{
        studentId: string;
        percentage: number;
        comment?: string;
      }>;
    },
  ) {
    return this.academicsService.bulkUpsertStudentGrades(
      user.tenantId,
      user,
      body,
    );
  }

  @Get('grades')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List student term grades' })
  listStudentGrades(
    @CurrentUser() user: AuthUser,
    @Query('subjectId') subjectId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('studentId') studentId?: string,
    @Query('term') term?: string,
  ) {
    return this.academicsService.listStudentGrades(user.tenantId, user, {
      subjectId,
      sectionId,
      studentId,
      term,
    });
  }

  @Post('report-cards')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Create or upsert report card' })
  createReportCard(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReportCardDto,
  ) {
    return this.academicsService.createReportCard(user.tenantId, user.id, dto);
  }

  @Post('report-cards/upload')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a report-card PDF (bulk wizard) and upsert its record',
  })
  uploadReportCard(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 15 }), // 15MB
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('term') term: string,
    @Body('studentId') studentId?: string,
  ) {
    return this.academicsService.uploadReportCard(user.tenantId, user.id, file, {
      term,
      studentId,
    });
  }

  @Post('report-cards/publish')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Publish DRAFT report cards for a term' })
  publishReportCards(
    @CurrentUser() user: AuthUser,
    @Body() body: { term: string; studentIds?: string[] },
  ) {
    return this.academicsService.publishReportCards(
      user.tenantId,
      body.term,
      body.studentIds,
    );
  }

  @Get('report-cards')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List report cards' })
  listReportCards(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listReportCards(user.tenantId, query);
  }

  @Patch('report-cards/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Delete report card' })
  deleteReportCard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.academicsService.deleteReportCard(user.tenantId, id);
  }

  @Post('consultations/bookings')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List consultation bookings' })
  listConsultationBookings(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAcademicsQueryDto,
  ) {
    return this.academicsService.listConsultationBookings(user.tenantId, query);
  }

  @Patch('consultations/bookings/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
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
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER)
  @ApiOperation({ summary: 'Delete consultation booking' })
  deleteConsultationBooking(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteConsultationBooking(user.tenantId, id);
  }

  @Get('consultations/bookings/export.ics')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.STAFF)
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

  @Get('consultations/configs')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all consultation days for this tenant' })
  listConsultationConfigs(@CurrentUser() user: AuthUser) {
    return this.academicsService.listConsultationConfigs(user.tenantId);
  }

  @Post('consultations/configs')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Create a new consultation day (date, time, default duration/location and per-teacher overrides)',
  })
  createConsultationConfig(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertConsultationConfigDto,
  ) {
    return this.academicsService.createConsultationConfig(
      user.tenantId,
      user.id,
      dto,
    );
  }

  @Patch('consultations/configs/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update a consultation day' })
  updateConsultationConfig(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertConsultationConfigDto,
  ) {
    return this.academicsService.updateConsultationConfig(
      user.tenantId,
      id,
      dto,
    );
  }

  @Patch('consultations/configs/:id/activate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Set a consultation day as the one shown to parents',
  })
  activateConsultationConfig(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.academicsService.activateConsultationConfig(
      user.tenantId,
      id,
    );
  }

  @Delete('consultations/configs/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Delete a consultation day' })
  deleteConsultationConfig(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.academicsService.deleteConsultationConfig(user.tenantId, id);
  }

  @Post('consultations/configs/capacity-check')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      "Dry-run capacity check for a proposed (not yet saved) consultation day — lets the UI warn before Save whether the selected sections/duration fit inside start-end.",
  })
  previewConsultationCapacity(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertConsultationConfigDto,
  ) {
    return this.academicsService.previewConsultationCapacity(
      user.tenantId,
      dto,
    );
  }

  @Get('consultations/preview')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary:
      'Preview the generated consultation schedule ordered by student performance, grouped by classroom. Defaults to the active consultation day; pass configId to preview another one.',
  })
  previewConsultationSlots(
    @CurrentUser() user: AuthUser,
    @Query('configId') configId?: string,
  ) {
    return this.academicsService.previewConsultationSlots(
      user.tenantId,
      configId,
    );
  }
}
