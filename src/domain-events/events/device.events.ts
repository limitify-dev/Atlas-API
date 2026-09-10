/**
 * Edge / scanning device availability events, emitted by the device-health
 * sweep (see DeviceHealthService). Consumed by the communications handler to
 * notify tenant admins that a smart-attendance device dropped off or recovered.
 */

export class DeviceOfflineEvent {
  static readonly EVENT = 'device.offline';

  constructor(
    public readonly tenantId: string,
    public readonly deviceId: string,
    public readonly deviceName: string,
    /** Last time the device was seen, or null if it never connected. */
    public readonly lastSeenAt: Date | null,
    /** Pre-resolved admin userIds for the tenant. */
    public readonly adminUserIds: string[],
  ) {}
}

export class DeviceRecoveredEvent {
  static readonly EVENT = 'device.recovered';

  constructor(
    public readonly tenantId: string,
    public readonly deviceId: string,
    public readonly deviceName: string,
    public readonly offlineForMs: number,
    public readonly adminUserIds: string[],
  ) {}
}
