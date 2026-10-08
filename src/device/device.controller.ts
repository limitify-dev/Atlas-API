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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequireModule } from '../common/module-access/require-module.decorator';
import { Role } from '../../prisma/generated/client';
import { RegisterDeviceDto, UpdateDeviceDto } from './dto';

/**
 * Tenant-facing device management. Part of the standalone Attendance module —
 * gated by `@RequireModule('attendance')`. The tenant is always taken from
 * the caller's token, never a query param. Device CUD (register/update/
 * delete/regenerate-key) is Studio-only now — see StudioDevicesController;
 * tenant admins keep read-only access (list/stats/health/logs) below.
 */
@ApiTags('Devices')
@ApiBearerAuth()
@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('attendance')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('register')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Register a device and issue its API key (shown once)',
  })
  async registerDevice(
    @CurrentUser() user: AuthUser,
    @Body() data: RegisterDeviceDto,
  ) {
    return this.deviceService.registerDevice({
      ...data,
      tenantId: user.tenantId,
      createdBy: user.id,
    });
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List the tenant devices' })
  async getDevices(@CurrentUser() user: AuthUser) {
    return this.deviceService.getDevicesByTenant(user.tenantId);
  }

  @Get('stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Device counts by status / type' })
  async getDeviceStats(@CurrentUser() user: AuthUser) {
    return this.deviceService.getDeviceStats(user.tenantId);
  }

  @Get('health')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({
    summary: 'Live network availability + scan throughput per device',
  })
  async getDeviceHealth(@CurrentUser() user: AuthUser) {
    return this.deviceService.getHealthSummary(user.tenantId);
  }

  @Get(':deviceId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'One device with its recent logs' })
  async getDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.getDeviceById(deviceId, user.tenantId);
  }

  @Post(':deviceId/regenerate-key')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Rotate the device API key (device goes INACTIVE until it reconnects)',
  })
  async regenerateApiKey(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.regenerateApiKey(
      deviceId,
      user.tenantId,
      user.id,
    );
  }

  @Put(':deviceId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update device details / status / config' })
  async updateDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
    @Body() data: UpdateDeviceDto,
  ) {
    return this.deviceService.updateDevice(deviceId, user.tenantId, data);
  }

  @Delete(':deviceId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a device' })
  async deleteDevice(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.deleteDevice(deviceId, user.tenantId);
  }

  @Get(':deviceId/logs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Device activity log' })
  async getDeviceLogs(
    @CurrentUser() user: AuthUser,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.deviceService.getDeviceLogs(
      deviceId,
      user.tenantId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
