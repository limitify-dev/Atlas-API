import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceModule } from '../device/device.module';
import { SchoolEntryController } from './school-entry.controller';
import { SchoolEntryService } from './school-entry.service';
import { SchoolEntryAnalyticsService } from './school-entry-analytics.service';

@Module({
  imports: [PrismaModule, DeviceModule],
  controllers: [SchoolEntryController],
  providers: [SchoolEntryService, SchoolEntryAnalyticsService],
  exports: [SchoolEntryService, SchoolEntryAnalyticsService],
})
export class SchoolEntryModule {}
