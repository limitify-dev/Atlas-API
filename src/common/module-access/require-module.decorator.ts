import { SetMetadata } from '@nestjs/common';

/** Metadata key read by {@link ModuleAccessGuard}. */
export const REQUIRED_MODULE_KEY = 'requiredModule';

/**
 * Platform module keys that can be enabled / disabled per tenant
 * (Atlas Studio → tenant → modules). Mirrors `studio_modules.key`.
 */
export type GatedModuleKey =
  | 'academics'
  | 'finance'
  | 'attendance'
  | 'connect';

/**
 * Restrict a controller (or a single route) to tenants that have the given
 * platform module enabled. Enforced by {@link ModuleAccessGuard}.
 *
 * Access is fail-open: a tenant with no explicit `tenant_modules` row for the
 * module is treated as enabled. SUPER_ADMIN and requests with no resolvable
 * tenant bypass the check.
 */
export const RequireModule = (moduleKey: GatedModuleKey) =>
  SetMetadata(REQUIRED_MODULE_KEY, moduleKey);
