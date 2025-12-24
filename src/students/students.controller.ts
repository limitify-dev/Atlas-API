import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  Header,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  UpdateStudentDto,
  QueryStudentsDto,
  StudentResponseDto,
  StudentStatsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new student' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Student created successfully',
    type: StudentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid grade or section ID',
  })
  async create(
    @Body() createStudentDto: CreateStudentDto,
    @CurrentUser() user: any,
  ): Promise<StudentResponseDto> {
    return this.studentsService.create(createStudentDto, user.tenantId);
  }

  @Post('bulk-upload')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk upload students from Excel/CSV' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Students processed successfully',
  })
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.studentsService.processBulkUpload(file, user.tenantId);
  }

  @Get('bulk-upload-template')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Download student bulk upload template' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Template downloaded successfully',
  })
  async getBulkUploadTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.studentsService.getBulkUploadTemplate();

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="student_import_template.xlsx"',
    });

    return new StreamableFile(buffer as any);
  }

  @Get('statistics')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get student statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    type: StudentStatsDto,
  })
  async getStatistics(@CurrentUser() user: any): Promise<StudentStatsDto> {
    return this.studentsService.getStatistics(user.tenantId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get all students with filtering and pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Students retrieved successfully',
  })
  async findAll(
    @Query() queryDto: QueryStudentsDto,
    @CurrentUser() user: any,
  ): Promise<{ data: StudentResponseDto[]; total: number; page: number; limit: number }> {
    return this.studentsService.findAll(queryDto, user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a student by ID' })
  @ApiParam({
    name: 'id',
    description: 'Student UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student retrieved successfully',
    type: StudentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<StudentResponseDto> {
    return this.studentsService.findOne(id, user.tenantId);
  }

  @Get('by-student-id/:studentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a student by student ID (e.g., ST001)' })
  @ApiParam({
    name: 'studentId',
    description: 'Student ID',
    example: 'ST001',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student retrieved successfully',
    type: StudentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found',
  })
  async findByStudentId(
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
  ): Promise<StudentResponseDto> {
    return this.studentsService.findByStudentId(studentId, user.tenantId);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a student' })
  @ApiParam({
    name: 'id',
    description: 'Student UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student updated successfully',
    type: StudentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  async update(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
    @CurrentUser() user: any,
  ): Promise<StudentResponseDto> {
    return this.studentsService.update(id, updateStudentDto, user.tenantId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a student' })
  @ApiParam({
    name: 'id',
    description: 'Student UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<{ message: string }> {
    return this.studentsService.remove(id, user.tenantId);
  }
}
