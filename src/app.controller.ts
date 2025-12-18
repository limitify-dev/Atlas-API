import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
