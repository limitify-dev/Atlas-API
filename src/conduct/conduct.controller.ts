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
import { ConductService } from './conduct.service';
import {
  CreateConductRecordDto,
  UpdateConductRecordDto,
  ResolveConductRecordDto,
  QueryConductRecordsDto,
  QueryPointsDto,
  DeductPointsDto,
  AddPointsDto,
  ConductRecordResponseDto,
  ConductRecordListResponseDto,
  StudentPointsResponseDto,
  PointsListResponseDto,
  ConductStatsDto,
  PointsDistributionDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Conduct')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conduct')
export class ConductController {
  constructor(private readonly conductService: ConductService) {}

  // =====================================
  // Conduct Records Endpoints
  // =====================================

  @Post('records')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER)
  @ApiOperation({ summary: 'Create a new conduct record' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Conduct record created successfully',
    type: ConductRecordResponseDto,
  })
  async createRecord(
    @Body() dto: CreateConductRecordDto,
    @CurrentUser() user: any,
  ): Promise<ConductRecordResponseDto> {
    // For teachers, use their teacher ID as reportedBy
    // For admin/DM without teacher record, pass null for teacherId and use userId
    const teacherId = user.teacherId || null;
    return this.conductService.createConductRecord(dto, user.tenantId, teacherId, user.id);
  }

  @Get('records')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'Get all conduct records with filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conduct records retrieved successfully',
    type: ConductRecordListResponseDto,
  })
  async findAllRecords(
    @Query() query: QueryConductRecordsDto,
    @CurrentUser() user: any,
  ): Promise<ConductRecordListResponseDto> {
    return this.conductService.findAllConductRecords(user.tenantId, query);
  }

  @Get('records/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'Get a single conduct record by ID' })
  @ApiParam({ name: 'id', description: 'Conduct record ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conduct record retrieved successfully',
    type: ConductRecordResponseDto,
  })
  async findOneRecord(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<ConductRecordResponseDto> {
    return this.conductService.findOneConductRecord(id, user.tenantId);
  }

  @Put('records/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Update a conduct record' })
  @ApiParam({ name: 'id', description: 'Conduct record ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conduct record updated successfully',
    type: ConductRecordResponseDto,
  })
  async updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateConductRecordDto,
    @CurrentUser() user: any,
  ): Promise<ConductRecordResponseDto> {
    return this.conductService.updateConductRecord(id, dto, user.tenantId);
  }

  @Put('records/:id/resolve')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Resolve a conduct record' })
  @ApiParam({ name: 'id', description: 'Conduct record ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conduct record resolved successfully',
    type: ConductRecordResponseDto,
  })
  async resolveRecord(
    @Param('id') id: string,
    @Body() dto: ResolveConductRecordDto,
    @CurrentUser() user: any,
  ): Promise<ConductRecordResponseDto> {
    return this.conductService.resolveConductRecord(id, dto, user.tenantId, user.id);
  }

  @Delete('records/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conduct record' })
  @ApiParam({ name: 'id', description: 'Conduct record ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Conduct record deleted successfully',
  })
  async removeRecord(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<void> {
    return this.conductService.removeConductRecord(id, user.tenantId);
  }

  // =====================================
  // Points Endpoints
  // =====================================

  @Get('points')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER)
  @ApiOperation({ summary: 'Get all students conduct points' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Points retrieved successfully',
    type: PointsListResponseDto,
  })
  async getAllPoints(
    @Query() query: QueryPointsDto,
    @CurrentUser() user: any,
  ): Promise<PointsListResponseDto> {
    return this.conductService.getAllStudentsPoints(user.tenantId, query);
  }

  @Get('points/student/:studentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'Get student conduct points with history' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Student points retrieved successfully',
    type: StudentPointsResponseDto,
  })
  async getStudentPoints(
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
  ): Promise<StudentPointsResponseDto> {
    return this.conductService.getStudentPoints(studentId, user.tenantId);
  }

  @Post('points/deduct')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER)
  @ApiOperation({ summary: 'Deduct points from a student' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Points deducted successfully',
    type: StudentPointsResponseDto,
  })
  async deductPoints(
    @Body() dto: DeductPointsDto,
    @CurrentUser() user: any,
  ): Promise<StudentPointsResponseDto> {
    return this.conductService.deductPoints(dto, user.tenantId, user.id);
  }

  @Post('points/add')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Add points to a student (for good behavior)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Points added successfully',
    type: StudentPointsResponseDto,
  })
  async addPoints(
    @Body() dto: AddPointsDto,
    @CurrentUser() user: any,
  ): Promise<StudentPointsResponseDto> {
    return this.conductService.addPoints(dto, user.tenantId, user.id);
  }

  @Post('points/reset/:studentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reset student points to 100' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Points reset successfully',
    type: StudentPointsResponseDto,
  })
  async resetPoints(
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
  ): Promise<StudentPointsResponseDto> {
    return this.conductService.resetStudentPoints(studentId, user.tenantId, user.id);
  }

  // =====================================
  // Statistics Endpoints
  // =====================================

  @Get('stats/overview')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Get conduct statistics overview' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    type: ConductStatsDto,
  })
  async getStats(@CurrentUser() user: any): Promise<ConductStatsDto> {
    return this.conductService.getStats(user.tenantId);
  }

  @Get('stats/points-distribution')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Get points distribution' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Distribution retrieved successfully',
    type: [PointsDistributionDto],
  })
  async getPointsDistribution(
    @CurrentUser() user: any,
  ): Promise<PointsDistributionDto[]> {
    return this.conductService.getPointsDistribution(user.tenantId);
  }

  @Get('stats/at-risk-students')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiOperation({ summary: 'Get at-risk students (below threshold)' })
  @ApiQuery({
    name: 'threshold',
    required: false,
    description: 'Points threshold (default 75)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'At-risk students retrieved successfully',
    type: [StudentPointsResponseDto],
  })
  async getAtRiskStudents(
    @Query('threshold') threshold: number,
    @CurrentUser() user: any,
  ): Promise<StudentPointsResponseDto[]> {
    return this.conductService.getAtRiskStudents(user.tenantId, threshold || 75);
  }
}
