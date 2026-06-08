export class PermissionRequestedEvent {
  static readonly EVENT = 'permission.requested';

  constructor(
    public readonly tenantId: string,
    public readonly permissionId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly reason: string,
    public readonly fromDate: Date,
    public readonly toDate: Date,
    /** Admin/teacher userIds to notify */
    public readonly adminUserIds: string[],
  ) {}
}

export class PermissionApprovedEvent {
  static readonly EVENT = 'permission.approved';

  constructor(
    public readonly tenantId: string,
    public readonly permissionId: string,
    public readonly studentName: string,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}

export class PermissionRejectedEvent {
  static readonly EVENT = 'permission.rejected';

  constructor(
    public readonly tenantId: string,
    public readonly permissionId: string,
    public readonly studentName: string,
    public readonly remarks: string | null,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}
