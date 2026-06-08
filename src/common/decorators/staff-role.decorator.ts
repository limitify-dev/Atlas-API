import { SetMetadata } from '@nestjs/common';

export const STAFF_ROLE_KEY = 'staffRoles';

/**
 * Restricts a route to staff members with specific staffRole values.
 * SUPER_ADMIN and ADMIN always bypass this check.
 *
 * Usage:
 *   @RequiresStaffRole('finance')
 *   @RequiresStaffRole('finance', 'discipline')
 */
export const RequiresStaffRole = (...roles: string[]) =>
  SetMetadata(STAFF_ROLE_KEY, roles);
