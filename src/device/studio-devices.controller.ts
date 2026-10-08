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
import { StudioGuard } from '../studio/guards/studio.guard';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RegisterDeviceDto, UpdateDeviceDto } from './dto';

/**
 * Device management, operated by a Studio super-admin on behalf of a
 * specific tenant (the tenant themselves only gets read-only access via
 * DeviceController). Mirrors DeviceController route-for-route, just taking
 * tenantId from the URL instead of the caller's own session.
 */
@ApiTags('studio-devices')
@ApiBearerAuth()
@Controller('studio/tenants/:tenantId/devices')
@UseGuards(JwtAuthGuard, StudioGuard)
export class StudioDevicesController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('register')
  @ApiOperation({
    summary: '[Studio] Register a device and issue its API key (shown once)',
  })
  async registerDevice(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() data: RegisterDeviceDto,
  ) {
    return this.deviceService.registerDevice({
      ...data,
      tenantId,
      createdBy: user.id,
    });
  }

  @Get()
  @ApiOperation({ summary: '[Studio] List a tenant\'s devices' })
  async getDevices(@Param('tenantId') tenantId: string) {
    return this.deviceService.getDevicesByTenant(tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: '[Studio] Device counts by status / type' })
  async getDeviceStats(@Param('tenantId') tenantId: string) {
    return this.deviceService.getDeviceStats(tenantId);
  }

  @Get('health')
  @ApiOperation({
    summary: '[Studio] Live network availability + scan throughput per device',
  })
  async getDeviceHealth(@Param('tenantId') tenantId: string) {
    return this.deviceService.getHealthSummary(tenantId);
  }

  @Get(':deviceId')
  @ApiOperation({ summary: '[Studio] One device with its recent logs' })
  async getDevice(
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.getDeviceById(deviceId, tenantId);
  }

  @Post(':deviceId/regenerate-key')
  @ApiOperation({
    summary:
      '[Studio] Rotate the device API key (device goes INACTIVE until it reconnects)',
  })
  async regenerateApiKey(
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deviceService.regenerateApiKey(deviceId, tenantId, user.id);
  }

  @Put(':deviceId')
  @ApiOperation({ summary: '[Studio] Update device details / status / config' })
  async updateDevice(
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
    @Body() data: UpdateDeviceDto,
  ) {
    return this.deviceService.updateDevice(deviceId, tenantId, data);
  }

  @Delete(':deviceId')
  @ApiOperation({ summary: '[Studio] Delete a device' })
  async deleteDevice(
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.deviceService.deleteDevice(deviceId, tenantId);
  }

  @Get(':deviceId/logs')
  @ApiOperation({ summary: '[Studio] Device activity log' })
  async getDeviceLogs(
    @Param('tenantId') tenantId: string,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.deviceService.getDeviceLogs(
      deviceId,
      tenantId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
