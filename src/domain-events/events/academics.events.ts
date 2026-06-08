export class GradeUpdatedEvent {
  static readonly EVENT = 'grade.updated';

  constructor(
    public readonly tenantId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly subjectName: string,
    public readonly percentage: number,
    public readonly term: string,
    /** Pre-resolved parent userIds */
    public readonly parentUserIds: string[],
  ) {}
}

export class AssignmentCreatedEvent {
  static readonly EVENT = 'assignment.created';

  constructor(
    public readonly tenantId: string,
    public readonly assignmentId: string,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly sectionId: string,
    public readonly subjectName: string,
    /** Pre-resolved student userIds in the section */
    public readonly studentUserIds: string[],
    /** Pre-resolved parent userIds of students in the section */
    public readonly parentUserIds: string[],
  ) {}
}

export class ReportUploadedEvent {
  static readonly EVENT = 'report.uploaded';

  constructor(
    public readonly tenantId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly term: string,
    /** Pre-resolved parent userIds */
    public readonly parentUserIds: string[],
  ) {}
}
