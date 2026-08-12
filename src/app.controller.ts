import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('Root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Public so the container/platform health check (an unauthenticated GET /)
  // gets 200 instead of 401 from the global JwtAuthGuard — otherwise the
  // service is marked unhealthy and the deploy never goes live.
  @Public()
  @Get()
  @ApiOperation({
    summary: 'API Health Check',
    description: 'Returns API information and health status',
  })
  @ApiResponse({
    status: 200,
    description: 'API is running successfully',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Atlas API' },
        version: { type: 'string', example: '1.0.0' },
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2025-12-05T10:30:00.000Z' },
        documentation: { type: 'string', example: '/doc' },
      },
    },
  })
  getApiInfo() {
    return this.appService.getApiInfo();
  }
}
