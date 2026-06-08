import { ConductType } from '../../../prisma/generated/client';

export class ConductRecordCreatedEvent {
  static readonly EVENT = 'conduct.record_created';

  constructor(
    public readonly tenantId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly type: ConductType,
    public readonly description: string,
    public readonly severity: number,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}

export class ConductRecordResolvedEvent {
  static readonly EVENT = 'conduct.record_resolved';

  constructor(
    public readonly tenantId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly resolutionNotes: string | null,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}
