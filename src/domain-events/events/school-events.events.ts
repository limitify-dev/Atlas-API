export class SchoolEventCreatedEvent {
  static readonly EVENT = 'school_event.created';

  constructor(
    public readonly tenantId: string,
    public readonly eventId: string,
    public readonly title: string,
    public readonly category: string,
    /** ISO date string of when the event takes place */
    public readonly eventDate: string,
    public readonly location: string | null,
    /** Pre-resolved userIds to notify (already filtered by audience) */
    public readonly recipientUserIds: string[],
  ) {}
}
