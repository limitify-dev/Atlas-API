import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// ─── Infrastructure ───────────────────────────────────────────────────────────
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { CacheModule } from './common/cache/cache.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { EmailModule } from './email/email.module';

// ─── Cross-cutting ────────────────────────────────────────────────────────────
import { DomainEventsModule } from './domain-events/domain-events.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { SubscriptionEnforcementGuard } from './common/guards/subscription-enforcement.guard';

// ─── Identity ─────────────────────────────────────────────────────────────────
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { TeachersModule } from './teachers/teachers.module';
import { StaffModule } from './identity/staff/staff.module';
import { StudioModule } from './studio/studio.module';
import { FeedbackModule } from './feedback/feedback.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';

// ─── Academic Structure ───────────────────────────────────────────────────────
import { GradesModule } from './grades/grades.module';
import { SectionsModule } from './sections/sections.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CombinationsModule } from './combinations/combinations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TimetableModule } from './timetable/timetable.module';
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
import { MomentsModule } from './moments/moments.module';
import { PollsModule } from './polls/polls.module';
import { UploadModule } from './upload/upload.module';

// ─── Platform / Admin ─────────────────────────────────────────────────────────
import { SystemLogsModule } from './system-logs/system-logs.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PlatformAnalyticsModule } from './platform-analytics/platform-analytics.module';
import { OnboardingRequestsModule } from './onboarding-requests/onboarding-requests.module';

// ─── DEFERRED (schema kept, module disabled) ──────────────────────────────────
// TransportModule  — import './transport/transport.module' when needed
// InventoryModule  — import './inventory/inventory.module' when needed

@Module({
  imports: [
    // ── Bootstrap ──────────────────────────────────────────────────────────────
    // Fail fast at boot if a critical env var is missing/malformed, instead of
    // surfacing as a confusing runtime error on the first request that needs it.
    // Only the vars the app truly can't run without are required; everything
    // else is validated-if-present. `allowUnknown` lets through the many other
    // process env vars (PATH, Render internals, …) untouched.
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(4000),
        // Truly required — the app cannot function without these.
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        // Optional / defaulted elsewhere — validated only for type if present.
        JWT_ACCESS_EXPIRY: Joi.string().optional(),
        JWT_REFRESH_EXPIRY: Joi.string().optional(),
        REDIS_URL: Joi.string().optional(),
        REDIS_HOST: Joi.string().optional(),
        REDIS_PORT: Joi.number().optional(),
        SUPABASE_URL: Joi.string().optional(),
        SUPABASE_KEY: Joi.string().optional(),
        TWILIO_ACCOUNT_SID: Joi.string().optional(),
        TWILIO_AUTH_TOKEN: Joi.string().optional(),
        TWILIO_PHONE_NUMBER: Joi.string().optional(),
        CORS_ORIGINS: Joi.string().optional(),
        FRONTEND_URL: Joi.string().optional(),
        WEB_URL: Joi.string().optional(),
        SUPPORT_EMAIL: Joi.string().optional(),
        SUPPORT_PHONE: Joi.string().optional(),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
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
    // Default rate limit for every route; endpoints prone to abuse (login,
    // OTP, password reset) override this with a tighter @Throttle(). Storage
    // is in-memory, which is fine for a single API instance — once running
    // multiple replicas, swap in a Redis-backed ThrottlerStorage so the
    // limit is enforced across instances rather than per-instance.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),

    // ── Infrastructure ─────────────────────────────────────────────────────────
    RedisModule,
    CacheModule,
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
    FeedbackModule,
    SubscriptionModule,
    StudentsModule,
    ParentsModule,

    // ── Academic Structure ─────────────────────────────────────────────────────
    GradesModule,
    SectionsModule,
    PromotionsModule,
    CombinationsModule,
    SubjectsModule,
    TimetableModule,
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
    MomentsModule,
    PollsModule,
    UploadModule,

    // ── Platform / Admin ───────────────────────────────────────────────────────
    SystemLogsModule,
    SubscriptionsModule,
    DashboardModule,
    PlatformAnalyticsModule,
    OnboardingRequestsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    LoggingInterceptor,
    // Global guard chain: Throttle → JWT → Tenant → Roles
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: SubscriptionEnforcementGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
