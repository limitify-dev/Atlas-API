import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { TeacherAttendanceAnalyticsService } from './teacher-attendance-analytics.service';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, DeviceModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceAnalyticsService,
    TeacherAttendanceAnalyticsService,
  ],
  exports: [
    AttendanceService,
    AttendanceAnalyticsService,
    TeacherAttendanceAnalyticsService,
  ],
})
export class AttendanceModule {}
