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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new section' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Section created successfully',
  })
  async create(
    @Body() createSectionDto: CreateSectionDto,
    @CurrentUser() user: any,
  ) {
    return this.sectionsService.create(user.tenantId, createSectionDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get all sections' })
  @ApiQuery({
    name: 'gradeId',
    required: false,
    description: 'Filter sections by grade ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sections retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: any,
    @Query('gradeId') gradeId?: string,
  ) {
    return this.sectionsService.findAll(user.tenantId, gradeId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get a section by ID' })
  @ApiParam({
    name: 'id',
    description: 'Section UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Section retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Section not found',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sectionsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a section' })
  @ApiParam({
    name: 'id',
    description: 'Section UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Section updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Body() updateSectionDto: UpdateSectionDto,
    @CurrentUser() user: any,
  ) {
    return this.sectionsService.update(user.tenantId, id, updateSectionDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a section' })
  @ApiParam({
    name: 'id',
    description: 'Section UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Section deleted successfully',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.sectionsService.remove(user.tenantId, id);
  }
}
