import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { TeacherAttendanceAnalyticsService } from './teacher-attendance-analytics.service';
import { StudentDayService } from './student-day.service';
import { AttendanceMaterializationService } from './attendance-materialization.service';
import { AttendanceReportService } from './attendance-report.service';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchoolEntryModule } from '../school-entry/school-entry.module';

@Module({
  imports: [PrismaModule, DeviceModule, SchoolEntryModule],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceAnalyticsService,
    TeacherAttendanceAnalyticsService,
    StudentDayService,
    AttendanceMaterializationService,
    AttendanceReportService,
  ],
  exports: [
    AttendanceService,
    AttendanceAnalyticsService,
    TeacherAttendanceAnalyticsService,
    StudentDayService,
  ],
})
export class AttendanceModule {}
