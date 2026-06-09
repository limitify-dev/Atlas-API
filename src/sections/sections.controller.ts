import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';

class AssignStudentsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  studentIds: string[];
}

@ApiTags('Sections (Classrooms)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a classroom, optionally linked to a promotion' })
  create(@Body() dto: CreateSectionDto, @CurrentUser() user: AuthUser) {
    return this.sectionsService.create(user.tenantId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'List classrooms — filter by grade, promotion, or active status' })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiQuery({ name: 'promotionId', required: false, description: 'Filter by promotion/cohort' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('gradeId') gradeId?: string,
    @Query('promotionId') promotionId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.sectionsService.findAll(user.tenantId, {
      gradeId,
      promotionId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.STAFF)
  @ApiOperation({ summary: 'Get a classroom with its students, teachers, promotion, and grade' })
  @ApiParam({ name: 'id', description: 'Section UUID' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a classroom (can reassign to a different promotion)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sectionsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a classroom (only if no students are assigned)' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.sectionsService.remove(user.tenantId, id);
  }

  // ─── STUDENT ASSIGNMENT ───────────────────────────────────────────────────

  @Post(':id/students')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Bulk-assign students to this classroom',
    description:
      'Moves all listed students into this section. Their grade is updated to match ' +
      'the section grade. If the section belongs to a promotion, students are stamped ' +
      'with that promotionId if they do not already have one.',
  })
  @ApiParam({ name: 'id', description: 'Section UUID' })
  @ApiBody({ type: AssignStudentsDto })
  assignStudents(
    @Param('id') id: string,
    @Body() body: AssignStudentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sectionsService.assignStudents(user.tenantId, id, body.studentIds);
  }
}
