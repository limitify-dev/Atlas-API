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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  QueryPermissionsDto,
  PermissionResponseDto,
  PermissionListResponseDto,
  PermissionQrDataDto,
  PermissionStatsDto,
  ApprovePermissionDto,
  RejectPermissionDto,
  CardCheckoutDto,
  CheckoutResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DeviceApiKeyGuard } from '../device/guards/device-api-key.guard';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // =====================================
  // Authenticated User Endpoints
  // =====================================

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Permission created successfully',
    type: PermissionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Student not found',
  })
  async create(
    @Body() createPermissionDto: CreatePermissionDto,
    @CurrentUser() user: any,
  ): Promise<PermissionResponseDto> {
    return this.permissionsService.create(
      createPermissionDto,
      user.tenantId,
      user.id,
      user.role,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all permissions with filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permissions retrieved successfully',
    type: PermissionListResponseDto,
  })
  async findAll(
    @Query() query: QueryPermissionsDto,
    @CurrentUser() user: any,
  ): Promise<PermissionListResponseDto> {
    return this.permissionsService.findAll(user.tenantId, query);
  }

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permission statistics overview' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Statistics retrieved successfully',
    type: PermissionStatsDto,
  })
  async getStats(@CurrentUser() user: any): Promise<PermissionStatsDto> {
    return this.permissionsService.getStats(user.tenantId);
  }

  @Get('check/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if student has active permission' })
  @ApiParam({ name: 'studentId', description: 'Student ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission check result',
  })
  async checkActivePermission(
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
  ): Promise<{ hasPermission: boolean; permission?: any }> {
    return this.permissionsService.checkActivePermission(studentId, user.tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single permission by ID' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission retrieved successfully',
    type: PermissionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<PermissionResponseDto> {
    return this.permissionsService.findOne(id, user.tenantId);
  }

  @Get(':id/qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM, Role.TEACHER, Role.PARENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get QR code data for a one-time permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'QR code data retrieved successfully',
    type: PermissionQrDataDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'QR code not available for this permission',
  })
  async getQrCode(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<PermissionQrDataDto> {
    return this.permissionsService.getQrCode(id, user.tenantId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission updated successfully',
    type: PermissionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Can only update pending permissions',
  })
  async update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
    @CurrentUser() user: any,
  ): Promise<PermissionResponseDto> {
    return this.permissionsService.update(id, updatePermissionDto, user.tenantId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Permission deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<void> {
    return this.permissionsService.remove(id, user.tenantId);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a pending permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission approved successfully',
    type: PermissionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Permission is not pending',
  })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApprovePermissionDto,
    @CurrentUser() user: any,
  ): Promise<PermissionResponseDto> {
    return this.permissionsService.approve(id, user.tenantId, user.id, dto.remarks);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DM)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a pending permission' })
  @ApiParam({ name: 'id', description: 'Permission ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission rejected successfully',
    type: PermissionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Permission is not pending',
  })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectPermissionDto,
    @CurrentUser() user: any,
  ): Promise<PermissionResponseDto> {
    return this.permissionsService.reject(id, user.tenantId, user.id, dto.remarks);
  }

  // =====================================
  // Device API Endpoints (for card scanners)
  // =====================================

  @Post('checkout/card')
  @UseGuards(DeviceApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Process student checkout with card (Device API)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Checkout processed',
    type: CheckoutResponseDto,
  })
  async processCardCheckout(
    @Body() dto: CardCheckoutDto,
    @Req() req: any,
  ): Promise<CheckoutResponseDto> {
    // tenantId comes from the device attached by DeviceApiKeyGuard
    return this.permissionsService.processCardCheckout(dto, req.tenantId);
  }
}
