import { Global, Module } from '@nestjs/common';
import { ModuleAccessService } from './module-access.service';
import { ModuleAccessGuard } from './module-access.guard';

/**
 * Per-tenant platform-module entitlements (Academics / Finance / Attendance).
 * Global so any controller can `@UseGuards(ModuleAccessGuard)` and any service
 * can inject `ModuleAccessService` without importing this module.
 *
 * PrismaService and CacheService are provided by their own @Global modules.
 */
@Global()
@Module({
  providers: [ModuleAccessService, ModuleAccessGuard],
  exports: [ModuleAccessService, ModuleAccessGuard],
})
export class ModuleAccessModule {}
