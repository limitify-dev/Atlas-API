import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getApiInfo() {
    return {
      name: 'Atlas API',
      version: '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      documentation: '/doc',
    };
  }
}
