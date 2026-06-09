import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AttendanceMarkedEvent,
  GradeUpdatedEvent,
  AssignmentCreatedEvent,
  ReportUploadedEvent,
  InvoiceCreatedEvent,
  PaymentSubmittedEvent,
  PaymentApprovedEvent,
  PaymentRejectedEvent,
  PaymentPromisedEvent,
  PermissionRequestedEvent,
  PermissionApprovedEvent,
  PermissionRejectedEvent,
  ConductRecordCreatedEvent,
} from '../../domain-events/events';
import { AttendanceStatus } from '../../../prisma/generated/client';

interface PushJob {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class DomainEventHandler {
  private readonly logger = new Logger(DomainEventHandler.name);

  constructor(
    @InjectQueue('push-notifications')
    private readonly pushQueue: Queue<PushJob>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── ATTENDANCE ──────────────────────────────────────────────────────────────

  @OnEvent(AttendanceMarkedEvent.EVENT)
  async handleAttendanceMarked(event: AttendanceMarkedEvent) {
    if (event.status !== AttendanceStatus.ABSENT) return;
    if (!event.parentUserIds.length) return;

    const title = 'Attendance Alert';
    const body = `${event.studentName} was marked absent today.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'attendance',
        studentId: event.studentId,
        status: event.status,
      },
    );
  }

  // ─── ACADEMICS ───────────────────────────────────────────────────────────────

  @OnEvent(GradeUpdatedEvent.EVENT)
  async handleGradeUpdated(event: GradeUpdatedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Grade Updated';
    const body = `${event.studentName} received ${event.percentage}% in ${event.subjectName} (${event.term}).`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'grade_updated',
        studentId: event.studentId,
        subjectName: event.subjectName,
        term: event.term,
      },
    );
  }

  @OnEvent(AssignmentCreatedEvent.EVENT)
  async handleAssignmentCreated(event: AssignmentCreatedEvent) {
    const recipients = [
      ...new Set([...event.studentUserIds, ...event.parentUserIds]),
    ];
    if (!recipients.length) return;

    const title = 'New Assignment';
    const due = new Date(event.dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const body = `${event.subjectName}: "${event.title}" — due ${due}.`;

    await this.enqueueAndNotify(event.tenantId, recipients, title, body, {
      type: 'assignment_created',
      assignmentId: event.assignmentId,
      sectionId: event.sectionId,
    });
  }

  @OnEvent(ReportUploadedEvent.EVENT)
  async handleReportUploaded(event: ReportUploadedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Report Card Available';
    const body = `${event.studentName}'s report card for ${event.term} has been published.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'report_uploaded',
        studentId: event.studentId,
        term: event.term,
      },
    );
  }

  // ─── FINANCE ─────────────────────────────────────────────────────────────────

  @OnEvent(InvoiceCreatedEvent.EVENT)
  async handleInvoiceCreated(event: InvoiceCreatedEvent) {
    if (!event.parentUserIds.length) return;

    const due = new Date(event.dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const title = 'New Invoice';
    const body = `An invoice of ${event.amount} for "${event.title}" is due on ${due}.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'invoice_created',
        invoiceId: event.invoiceId,
        studentId: event.studentId,
      },
    );
  }

  @OnEvent(PaymentSubmittedEvent.EVENT)
  async handlePaymentSubmitted(event: PaymentSubmittedEvent) {
    if (!event.financeStaffUserIds.length) return;

    const title = 'Payment Proof Submitted';
    const body = `${event.studentName} submitted a payment proof. Review required.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.financeStaffUserIds,
      title,
      body,
      {
        type: 'payment_submitted',
        invoiceId: event.invoiceId,
        submissionId: event.submissionId,
      },
    );
  }

  @OnEvent(PaymentApprovedEvent.EVENT)
  async handlePaymentApproved(event: PaymentApprovedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Payment Approved ✓';
    const body = event.reviewNote
      ? `Your payment was approved. Note: ${event.reviewNote}`
      : 'Your payment has been approved and the invoice is now settled.';

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'payment_approved',
        invoiceId: event.invoiceId,
      },
    );
  }

  @OnEvent(PaymentRejectedEvent.EVENT)
  async handlePaymentRejected(event: PaymentRejectedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Payment Rejected';
    const body = event.reviewNote
      ? `Your payment was rejected. Reason: ${event.reviewNote}`
      : 'Your payment proof was rejected. Please resubmit with a valid proof.';

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'payment_rejected',
        invoiceId: event.invoiceId,
      },
    );
  }

  @OnEvent(PaymentPromisedEvent.EVENT)
  async handlePaymentPromised(event: PaymentPromisedEvent) {
    if (!event.financeStaffUserIds.length) return;

    const due = new Date(event.promisedDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const title = 'Payment Promise Received';
    const body = `${event.studentName}'s parent has promised to pay by ${due}.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.financeStaffUserIds,
      title,
      body,
      {
        type: 'payment_promised',
        invoiceId: event.invoiceId,
      },
    );
  }

  // ─── PERMISSIONS ─────────────────────────────────────────────────────────────

  @OnEvent(PermissionRequestedEvent.EVENT)
  async handlePermissionRequested(event: PermissionRequestedEvent) {
    if (!event.adminUserIds.length) return;

    const title = 'Permission Request';
    const body = `${event.studentName}: "${event.reason}"`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.adminUserIds,
      title,
      body,
      {
        type: 'permission_requested',
        permissionId: event.permissionId,
        studentId: event.studentId,
      },
    );
  }

  @OnEvent(PermissionApprovedEvent.EVENT)
  async handlePermissionApproved(event: PermissionApprovedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Permission Approved';
    const body = `The permission request for ${event.studentName} has been approved.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'permission_approved',
        permissionId: event.permissionId,
      },
    );
  }

  @OnEvent(PermissionRejectedEvent.EVENT)
  async handlePermissionRejected(event: PermissionRejectedEvent) {
    if (!event.parentUserIds.length) return;

    const title = 'Permission Declined';
    const body = event.remarks
      ? `The permission request for ${event.studentName} was declined. Reason: ${event.remarks}`
      : `The permission request for ${event.studentName} was declined.`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'permission_rejected',
        permissionId: event.permissionId,
      },
    );
  }

  // ─── CONDUCT ─────────────────────────────────────────────────────────────────

  @OnEvent(ConductRecordCreatedEvent.EVENT)
  async handleConductRecordCreated(event: ConductRecordCreatedEvent) {
    if (!event.parentUserIds.length) return;

    const title =
      event.type === 'PRAISE' ? 'Conduct — Praise' : 'Conduct Notice';
    const body = `${event.studentName}: ${event.description}`;

    await this.enqueueAndNotify(
      event.tenantId,
      event.parentUserIds,
      title,
      body,
      {
        type: 'conduct_record',
        studentId: event.studentId,
        conductType: event.type,
      },
    );
  }

  // ─── HELPER ──────────────────────────────────────────────────────────────────

  private async enqueueAndNotify(
    tenantId: string,
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any>,
  ) {
    // 1. Enqueue the push notification (BullMQ — retried on failure)
    await this.pushQueue
      .add(
        'send-push-bulk',
        { userIds, title, body, data },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
      .catch((err) =>
        this.logger.error(
          `Failed to enqueue push for ${title}: ${err.message}`,
        ),
      );

    // 2. Create in-app notification records
    await this.notificationsService
      .createNotificationsForUsers({
        tenantId,
        userIds,
        title,
        message: body,
        type: data.type,
        data,
      })
      .catch((err) =>
        this.logger.error(
          `Failed to create notifications for ${title}: ${err.message}`,
        ),
      );
  }
}
