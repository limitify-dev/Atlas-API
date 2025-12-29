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
  Request,
} from '@nestjs/common';
import { DeviceService } from './device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeviceType, DeviceStatus } from '../../prisma/generated/client';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('register')
  async registerDevice(
    @Request() req: any,
    @Body()
    data: {
      tenantId: string;
      name: string;
      deviceType: DeviceType;
      location?: string;
      description?: string;
    },
  ) {
    return this.deviceService.registerDevice({
      ...data,
      createdBy: req.user.userId,
    });
  }

  @Get()
  async getDevices(@Query('tenantId') tenantId: string) {
    return this.deviceService.getDevicesByTenant(tenantId);
  }

  @Get('stats')
  async getDeviceStats(@Query('tenantId') tenantId: string) {
    return this.deviceService.getDeviceStats(tenantId);
  }

  @Get(':deviceId')
  async getDevice(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.deviceService.getDeviceById(deviceId, tenantId);
  }

  @Post(':deviceId/regenerate-key')
  async regenerateApiKey(
    @Request() req: any,
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.deviceService.regenerateApiKey(
      deviceId,
      tenantId,
      req.user.userId,
    );
  }

  @Put(':deviceId')
  async updateDevice(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Body()
    data: {
      name?: string;
      location?: string;
      description?: string;
      status?: DeviceStatus;
      metadata?: any;
    },
  ) {
    return this.deviceService.updateDevice(deviceId, tenantId, data);
  }

  @Delete(':deviceId')
  async deleteDevice(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.deviceService.deleteDevice(deviceId, tenantId);
  }

  @Get(':deviceId/logs')
  async getDeviceLogs(
    @Param('deviceId') deviceId: string,
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.deviceService.getDeviceLogs(
      deviceId,
      tenantId,
      limit ? parseInt(limit) : 100,
    );
  }
}
