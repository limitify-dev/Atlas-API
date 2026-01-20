import { Module } from '@nestjs/common';
import { PlatformAnalyticsService } from './platform-analytics.service';
import { PlatformAnalyticsController } from './platform-analytics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService],
  exports: [PlatformAnalyticsService],
})
export class PlatformAnalyticsModule {}
