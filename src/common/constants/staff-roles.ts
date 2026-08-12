/**
 * Canonical staff sub-roles stored on Staff.staffRole.
 * User.role remains STAFF; staffRole distinguishes DOS, DM, Bursar, etc.
 */
export const StaffRole = {
  STUDIES: 'studies',
  DOS: 'dos',
  DISCIPLINE: 'discipline',
  DM: 'dm',
  STAFF_ACADEMICS: 'staff-academics',
  FINANCE: 'finance',
  BURSAR: 'bursar',
} as const;

/**
 * Staff roles that can access the academics portal actions: recording
 * attendance, approving/rejecting leave-exit permissions, and awarding
 * conduct points. Kept as an array (not a single value) so staff still
 * tagged "discipline"/"dm" keep access alongside the new "staff-academics"
 * value, without requiring a data migration.
 */
export const ACADEMICS_STAFF_ROLES: string[] = [
  StaffRole.STAFF_ACADEMICS,
  StaffRole.DISCIPLINE,
  StaffRole.DM,
];

/** Staff roles parents are allowed to message (academics + discipline + finance). */
export const PARENT_MESSAGING_STAFF_ROLES: string[] = [
  StaffRole.STUDIES,
  StaffRole.DOS,
  StaffRole.DISCIPLINE,
  StaffRole.DM,
  StaffRole.STAFF_ACADEMICS,
  StaffRole.FINANCE,
  StaffRole.BURSAR,
];

/** Map a Staff.staffRole value to a display/group key for clients. */
export function resolveStaffDisplayRole(staffRole: string): string {
  const normalized = staffRole.trim().toLowerCase();
  if (normalized === StaffRole.STUDIES || normalized === StaffRole.DOS) {
    return 'DOS';
  }
  if (normalized === StaffRole.STAFF_ACADEMICS) {
    return 'STAFF_ACADEMICS';
  }
  if (normalized === StaffRole.DISCIPLINE || normalized === StaffRole.DM) {
    return 'DM';
  }
  if (normalized === StaffRole.FINANCE || normalized === StaffRole.BURSAR) {
    return 'BURSAR';
  }
  return staffRole.toUpperCase();
}

/** Resolve the role label clients should show for a contact. */
export function resolveContactDisplayRole(user: {
  role: string;
  staff?: { staffRole: string } | null;
}): string {
  if (user.role === 'STAFF' && user.staff?.staffRole) {
    return resolveStaffDisplayRole(user.staff.staffRole);
  }
  return user.role;
}
