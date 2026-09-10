import { StaffRole } from './staff-roles';

/**
 * Staff sub-roles allowed into the standalone Attendance module's oversight
 * surface: read-only in-class attendance analytics and campus check-in
 * marking / override. The Director of Studies ("studies" / "dos") sits here.
 *
 * In-class subject registers stay teacher/admin-only — the DoS reviews them
 * but does not mark them. Keep this list narrow; broaden only with intent.
 */
export const ATTENDANCE_STAFF_ROLES: string[] = [
  StaffRole.STUDIES,
  StaffRole.DOS,
];
