import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { EmailModule } from './email/email.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';
import { TeachersModule } from './teachers/teachers.module';
import { GradesModule } from './grades/grades.module';
import { SectionsModule } from './sections/sections.module';
import { CombinationsModule } from './combinations/combinations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LibraryModule } from './library/library.module';
import { TransportModule } from './transport/transport.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ConductModule } from './conduct/conduct.module';
import { CommunicationsModule } from './communications/communications.module';
import { InventoryModule } from './inventory/inventory.module';
import { EventsModule } from './events/events.module';
import { CardsModule } from './cards/cards.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DeviceModule } from './device/device.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes env vars available everywhere
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    StudentsModule,
    ParentsModule,
    TeachersModule,
    GradesModule,
    SectionsModule,
    CombinationsModule,
    SubjectsModule,
    AttendanceModule,
    LibraryModule,
    TransportModule,
    PermissionsModule,
    ConductModule,
    CommunicationsModule,
    InventoryModule,
    EventsModule,
    CardsModule,
    DashboardModule,
    DeviceModule,
    SystemLogsModule,
    PlatformAnalyticsModule,
    SubscriptionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
