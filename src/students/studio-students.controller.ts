import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentsService } from './students.service';
import { QueryStudentsDto, StudentResponseDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudioGuard } from '../studio/guards/studio.guard';

/**
 * The subset of student data the relocated e-Registration flow needs,
 * operated by a Studio super-admin on behalf of a specific tenant. Mirrors
 * the read/photo routes on StudentsController, taking tenantId from the URL
 * instead of the caller's own session (a Studio user has no tenant of
 * their own). General student CRUD stays tenant-side only — this
 * controller intentionally exposes just list + photo.
 */
@ApiTags('studio-students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudioGuard)
@Controller('studio/tenants/:tenantId/students')
export class StudioStudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiOperation({ summary: '[Studio] List a tenant\'s students' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() queryDto: QueryStudentsDto,
  ): Promise<{
    data: StudentResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.studentsService.findAll(queryDto, tenantId);
  }

  @Patch(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  @ApiOperation({ summary: '[Studio] Update only a student\'s photo (e-Registration capture)' })
  async updatePhoto(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @UploadedFile() photo: Express.Multer.File,
  ): Promise<StudentResponseDto> {
    if (!photo) {
      throw new BadRequestException('A photo file is required');
    }
    return this.studentsService.updatePhotoOnly(id, tenantId, photo);
  }
}
