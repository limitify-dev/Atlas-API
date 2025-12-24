import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { GradesService } from './grades.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Grades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new grade' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Grade created successfully',
  })
  async create(
    @Body() createGradeDto: CreateGradeDto,
    @CurrentUser() user: any,
  ) {
    return this.gradesService.create(user.tenantId, createGradeDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get all grades' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Grades retrieved successfully',
  })
  async findAll(@CurrentUser() user: any) {
    return this.gradesService.findAll(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a grade by ID' })
  @ApiParam({
    name: 'id',
    description: 'Grade UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Grade retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Grade not found',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gradesService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a grade' })
  @ApiParam({
    name: 'id',
    description: 'Grade UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Grade updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Body() updateGradeDto: UpdateGradeDto,
    @CurrentUser() user: any,
  ) {
    return this.gradesService.update(user.tenantId, id, updateGradeDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a grade' })
  @ApiParam({
    name: 'id',
    description: 'Grade UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Grade deleted successfully',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gradesService.remove(user.tenantId, id);
  }
}
