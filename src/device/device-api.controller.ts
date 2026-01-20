import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { DeviceApiKeyGuard } from './guards/device-api-key.guard';

/**
 * Device API Controller
 * Endpoints for Atlas-Edge devices using API key authentication
 */
@ApiTags('Device API')
@Controller('device-api')
@UseGuards(DeviceApiKeyGuard)
@ApiSecurity('device-api-key')
export class DeviceApiController {
  constructor(private readonly deviceService: DeviceService) {}

  /**
   * Health check endpoint for Edge devices
   */
  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if the API is reachable and device is authenticated',
  })
  @ApiResponse({
    status: 200,
    description: 'API is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2024-01-15T08:30:00.000Z' },
        device: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  })
  async healthCheck(@Request() req: any) {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      device: {
        id: req.device.id,
        name: req.device.name,
        status: req.device.status,
      },
    };
  }

  /**
   * Device info endpoint
   */
  @Get('info')
  @ApiOperation({
    summary: 'Get device information',
    description: 'Retrieve information about the authenticated device',
  })
  @ApiResponse({
    status: 200,
    description: 'Device information retrieved successfully',
  })
  async getDeviceInfo(@Request() req: any) {
    return {
      device: {
        id: req.device.id,
        name: req.device.name,
        location: req.device.location,
        deviceType: req.device.deviceType,
        status: req.device.status,
        lastSeenAt: req.device.lastSeenAt,
        createdAt: req.device.createdAt,
      },
      tenant: req.device.tenant,
    };
  }

  /**
   * Heartbeat endpoint for Edge devices
   */
  @Post('heartbeat')
  @ApiOperation({
    summary: 'Device heartbeat',
    description: 'Send a heartbeat to indicate the device is online and functioning',
  })
  @ApiResponse({
    status: 200,
    description: 'Heartbeat received successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Heartbeat received' },
        device_id: { type: 'string' },
        timestamp: { type: 'string' },
        status: { type: 'string', example: 'ACTIVE' },
      },
    },
  })
  async heartbeat(
    @Request() req: any,
    @Body() data: { status?: string; metadata?: any },
  ) {
    const device = req.device;

    // Update device status to ACTIVE and last seen time
    await this.deviceService.updateDevice(device.id, device.tenantId, {
      status: 'ACTIVE',
      metadata: {
        ...device.metadata,
        lastHeartbeat: new Date().toISOString(),
        ...data.metadata,
      },
    });

    // Log heartbeat
    const ipAddress = req.ip || req.connection?.remoteAddress;
    await this.deviceService.logDeviceActivity(
      device.id,
      'HEARTBEAT',
      'Device heartbeat received',
      ipAddress,
      { reportedStatus: data.status },
    );

    return {
      message: 'Heartbeat received',
      device_id: device.id,
      timestamp: new Date().toISOString(),
      status: 'ACTIVE',
    };
  }

  /**
   * Device self-registration/update endpoint
   * Used by Edge devices to confirm their registration and update info
   */
  @Post('register')
  @ApiOperation({
    summary: 'Device self-registration',
    description:
      'Allows an authenticated Edge device to confirm registration and update its information',
  })
  @ApiResponse({
    status: 200,
    description: 'Device registration confirmed',
  })
  async registerDevice(
    @Request() req: any,
    @Body()
    data: {
      device_id?: string;
      device_name?: string;
      location?: string;
      metadata?: any;
    },
  ) {
    const device = req.device;

    // Update device info if provided
    const updateData: any = {};
    if (data.device_name) updateData.name = data.device_name;
    if (data.location) updateData.location = data.location;
    if (data.metadata) {
      updateData.metadata = {
        ...device.metadata,
        ...data.metadata,
        registeredAt: new Date().toISOString(),
      };
    }

    // Activate the device
    updateData.status = 'ACTIVE';

    const updatedDevice = await this.deviceService.updateDevice(
      device.id,
      device.tenantId,
      updateData,
    );

    // Log registration
    const ipAddress = req.ip || req.connection?.remoteAddress;
    await this.deviceService.logDeviceActivity(
      device.id,
      'REGISTRATION_CONFIRMED',
      'Edge device registration confirmed',
      ipAddress,
      data,
    );

    return {
      message: 'Device registration confirmed',
      device: {
        id: updatedDevice.id,
        name: updatedDevice.name,
        location: updatedDevice.location,
        status: updatedDevice.status,
        deviceType: updatedDevice.deviceType,
      },
      tenant: device.tenant,
    };
  }
}
