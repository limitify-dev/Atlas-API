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
import { TeachersService } from './teachers.service';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
  QueryTeachersDto,
  TeacherResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Teachers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post()
  @UseInterceptors(FileInterceptor('photo'))
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Create a new teacher' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Teacher created successfully',
    type: TeacherResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  async create(
    @Body() createTeacherDto: CreateTeacherDto,
    @CurrentUser() user: AuthUser,
    @UploadedFile() photo?: Express.Multer.File,
  ): Promise<TeacherResponseDto> {
    return this.teachersService.create(createTeacherDto, user.tenantId, photo);
  }

  @Post('bulk-upload')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk upload teachers from Excel/CSV' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Teachers processed successfully',
  })
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teachersService.processBulkUpload(file, user.tenantId);
  }

  @Get('bulk-upload-template')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Download teacher bulk upload template' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Template downloaded successfully',
  })
  getBulkUploadTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = this.teachersService.getBulkUploadTemplate();

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="teacher_import_template.xlsx"',
    });

    return new StreamableFile(buffer as unknown as Uint8Array);
  }

  @Get('statistics')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get teacher statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
  })
  async getStatistics(@CurrentUser() user: AuthUser) {
    return this.teachersService.getStatistics(user.tenantId);
  }

  @Get('my-consultation-slots')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Get consultation slots assigned to the current teacher',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Consultation slots retrieved successfully',
  })
  async getMyConsultationSlots(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachersService.getMyConsultationSlots(user.id, user.tenantId, {
      date,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('me')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Get the current teacher profile with assigned classes and subjects',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher profile retrieved successfully',
  })
  async findMe(@CurrentUser() user: AuthUser) {
    return this.teachersService.findMe(user.id, user.tenantId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get all teachers with filtering and pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teachers retrieved successfully',
  })
  async findAll(
    @Query() queryDto: QueryTeachersDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{
    data: TeacherResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.teachersService.findAll(queryDto, user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a teacher by ID' })
  @ApiParam({
    name: 'id',
    description: 'Teacher UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher retrieved successfully',
    type: TeacherResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Teacher not found',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<TeacherResponseDto> {
    return this.teachersService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('photo'))
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Update a teacher' })
  @ApiParam({
    name: 'id',
    description: 'Teacher UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher updated successfully',
    type: TeacherResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Teacher not found',
  })
  async update(
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
    @CurrentUser() user: AuthUser,
    @UploadedFile() photo?: Express.Multer.File,
  ): Promise<TeacherResponseDto> {
    return this.teachersService.update(
      id,
      updateTeacherDto,
      user.tenantId,
      photo,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a teacher' })
  @ApiParam({
    name: 'id',
    description: 'Teacher UUID',
    example: 'uuid-string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Teacher deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Teacher not found',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    return this.teachersService.remove(id, user.tenantId);
  }
}
