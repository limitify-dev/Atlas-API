export class InvoiceCreatedEvent {
  static readonly EVENT = 'invoice.created';

  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly studentId: string,
    public readonly studentName: string,
    public readonly title: string,
    public readonly amount: number,
    public readonly dueDate: Date,
    /** Pre-resolved parent userIds */
    public readonly parentUserIds: string[],
  ) {}
}

export class InvoicesBulkCreatedEvent {
  static readonly EVENT = 'invoice.bulk_created';

  constructor(
    public readonly tenantId: string,
    public readonly count: number,
    public readonly term: string | undefined,
    public readonly category: string | undefined,
  ) {}
}

export class PaymentSubmittedEvent {
  static readonly EVENT = 'payment.submitted';

  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly submissionId: string,
    public readonly studentName: string,
    /** Finance staff userIds to notify */
    public readonly financeStaffUserIds: string[],
  ) {}
}

export class PaymentApprovedEvent {
  static readonly EVENT = 'payment.approved';

  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly reviewNote: string | null,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}

export class PaymentRejectedEvent {
  static readonly EVENT = 'payment.rejected';

  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly reviewNote: string | null,
    /** Parent userIds to notify */
    public readonly parentUserIds: string[],
  ) {}
}

export class PaymentPromisedEvent {
  static readonly EVENT = 'payment.promised';

  constructor(
    public readonly tenantId: string,
    public readonly invoiceId: string,
    public readonly promisedDate: Date,
    public readonly studentName: string,
    /** Finance staff userIds to notify */
    public readonly financeStaffUserIds: string[],
  ) {}
}
