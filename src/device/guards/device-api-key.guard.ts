import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceService } from '../device.service';

@Injectable()
export class DeviceApiKeyGuard implements CanActivate {
  constructor(private deviceService: DeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    try {
      // Authenticate device
      const device = await this.deviceService.authenticateDevice(apiKey);

      // Attach device info to request
      request.device = device;
      request.tenantId = device.tenantId;

      // Log the connection
      const ipAddress = request.ip || request.connection.remoteAddress;
      await this.deviceService.logDeviceActivity(
        device.id,
        'API_REQUEST',
        `${request.method} ${request.url}`,
        ipAddress,
      );

      return true;
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Invalid API key');
    }
  }

  private extractApiKey(request: any): string | null {
    // Try to get API key from Authorization header
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try to get API key from X-API-Key header
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    // Try to get API key from query parameter (less secure, but useful for testing)
    const apiKeyQuery = request.query['apiKey'];
    if (apiKeyQuery) {
      return apiKeyQuery;
    }

    return null;
  }
}
