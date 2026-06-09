import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// ─── Infrastructure ───────────────────────────────────────────────────────────
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { EmailModule } from './email/email.module';

// ─── Cross-cutting ────────────────────────────────────────────────────────────
import { DomainEventsModule } from './domain-events/domain-events.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './auth/guards/roles.guard';

// ─── Identity ─────────────────────────────────────────────────────────────────
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { TeachersModule } from './teachers/teachers.module';
import { StaffModule } from './identity/staff/staff.module';
import { StudioModule } from './studio/studio.module';

// ─── Academic Structure ───────────────────────────────────────────────────────
import { GradesModule } from './grades/grades.module';
import { SectionsModule } from './sections/sections.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CombinationsModule } from './combinations/combinations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicsModule } from './academics/academics.module';

// ─── Core Domains ─────────────────────────────────────────────────────────────
import { AttendanceModule } from './attendance/attendance.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ConductModule } from './conduct/conduct.module';
import { CommunicationsModule } from './communications/communications.module';
import { FinanceModule } from './finance/finance.module';

// ─── Device / Edge ────────────────────────────────────────────────────────────
import { DeviceModule } from './device/device.module';

// ─── Kept Modules (non-core but complete) ─────────────────────────────────────
import { LibraryModule } from './library/library.module';
import { CardsModule } from './cards/cards.module';
import { EventsModule } from './events/events.module';

// ─── Platform / Admin ─────────────────────────────────────────────────────────
import { SystemLogsModule } from './system-logs/system-logs.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DashboardModule } from './dashboard/dashboard.module';

// ─── DEFERRED (schema kept, module disabled) ──────────────────────────────────
// TransportModule  — import './transport/transport.module' when needed
// InventoryModule  — import './inventory/inventory.module' when needed

@Module({
  imports: [
    // ── Bootstrap ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      ignoreErrors: false,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // ── Infrastructure ─────────────────────────────────────────────────────────
    RedisModule,
    SupabaseModule,
    PrismaModule,
    EmailModule,

    // ── Cross-cutting ──────────────────────────────────────────────────────────
    DomainEventsModule, // @Global — no need to re-import in feature modules

    // ── Identity ───────────────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    TenantsModule,
    TeachersModule,
    StaffModule,
    StudioModule,

    // ── Academic Structure ─────────────────────────────────────────────────────
    GradesModule,
    SectionsModule,
    PromotionsModule,
    CombinationsModule,
    SubjectsModule,
    AcademicsModule,

    // ── Core Domains ───────────────────────────────────────────────────────────
    AttendanceModule,
    PermissionsModule,
    ConductModule,
    CommunicationsModule,
    FinanceModule,

    // ── Device / Edge ──────────────────────────────────────────────────────────
    DeviceModule,

    // ── Kept Modules ───────────────────────────────────────────────────────────
    LibraryModule,
    CardsModule,
    EventsModule,

    // ── Platform / Admin ───────────────────────────────────────────────────────
    SystemLogsModule,
    SubscriptionsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggingInterceptor,
    // Global guard chain: JWT → Tenant → Roles
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
