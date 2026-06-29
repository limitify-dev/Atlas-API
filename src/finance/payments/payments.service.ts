import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import {
  InvoiceStatus,
  PaymentSubmissionStatus,
  PaymentPromiseStatus,
} from '../../../prisma/generated/client';
import {
  SubmitProofDto,
  PromiseToPayDto,
  ReviewSubmissionDto,
  ReviewPromiseDto,
} from '../dto';
import {
  PaymentApprovedEvent,
  PaymentPromisedEvent,
  PaymentRejectedEvent,
  PaymentSubmittedEvent,
  GraceApprovedEvent,
  GraceRefusedEvent,
  OverdueReminderEvent,
} from '../../domain-events/events';
import { Prisma } from '../../../prisma/generated/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  // ─── PARENT ACTIONS ──────────────────────────────────────────────────────────

  async submitProof(
    tenantId: string,
    invoiceId: string,
    dto: SubmitProofDto,
    parentUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!invoice) throw new NotFoundException('Invoice not found.');

      if (invoice.status === InvoiceStatus.PAID) {
        throw new ConflictException('This invoice is already paid.');
      }
      if (invoice.status === InvoiceStatus.PENDING_VERIFICATION) {
        throw new ConflictException(
          'A payment is already under review. Wait for the current submission to be resolved before resubmitting.',
        );
      }
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new ConflictException('This invoice has been cancelled.');
      }

      const [submission] = await Promise.all([
        tx.paymentSubmission.create({
          data: {
            tenantId,
            invoiceId,
            submittedBy: parentUserId,
            proofUrl: dto.proofUrl,
            note: dto.note,
            amountClaimed: dto.amountClaimed
              ? new Prisma.Decimal(dto.amountClaimed)
              : null,
          },
        }),
        tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: InvoiceStatus.PENDING_VERIFICATION,
            lockedAt: new Date(),
          },
        }),
      ]);

      // Resolve finance staff to notify
      const financeStaff = await this.prisma.staff.findMany({
        where: { tenantId, staffRole: 'finance' },
        select: { userId: true },
      });
      const financeStaffUserIds = financeStaff.map((s) => s.userId);
      const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`;

      this.events.emit(
        new PaymentSubmittedEvent(
          tenantId,
          invoiceId,
          submission.id,
          studentName,
          financeStaffUserIds,
        ),
      );

      return submission;
    });
  }

  async promiseToPay(
    tenantId: string,
    invoiceId: string,
    dto: PromiseToPayDto,
    parentUserId: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        student: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Invoice is already paid.');
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new ConflictException('Invoice has been cancelled.');
    }

    const promisedDate = new Date(dto.promisedDate);
    if (promisedDate <= new Date()) {
      throw new BadRequestException('promisedDate must be a future date.');
    }

    // Cancel any existing ACTIVE promise for the same invoice
    await this.prisma.paymentPromise.updateMany({
      where: { invoiceId, tenantId, status: PaymentPromiseStatus.ACTIVE },
      data: { status: PaymentPromiseStatus.OVERDUE },
    });

    const promise = await this.prisma.paymentPromise.create({
      data: {
        tenantId,
        invoiceId,
        promisedBy: parentUserId,
        promisedDate,
        note: dto.note,
      },
    });

    const financeStaff = await this.prisma.staff.findMany({
      where: { tenantId, staffRole: 'finance' },
      select: { userId: true },
    });
    const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`;

    this.events.emit(
      new PaymentPromisedEvent(
        tenantId,
        invoiceId,
        promisedDate,
        studentName,
        financeStaff.map((s) => s.userId),
      ),
    );

    return promise;
  }

  // ─── FINANCE STAFF ACTIONS ───────────────────────────────────────────────────

  async review(
    tenantId: string,
    submissionId: string,
    dto: ReviewSubmissionDto,
    staffUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.paymentSubmission.findFirst({
        where: { id: submissionId, tenantId },
        include: {
          invoice: {
            include: {
              student: {
                include: {
                  parents: { include: { parent: { include: { user: true } } } },
                },
              },
            },
          },
        },
      });

      if (!submission)
        throw new NotFoundException('Payment submission not found.');

      if (submission.status !== PaymentSubmissionStatus.PENDING_REVIEW) {
        throw new ConflictException(
          `Submission has already been ${submission.status.toLowerCase().replace('_', ' ')}.`,
        );
      }

      const newSubmissionStatus = dto.approved
        ? PaymentSubmissionStatus.APPROVED
        : PaymentSubmissionStatus.REJECTED;

      const newInvoiceStatus = dto.approved
        ? InvoiceStatus.PAID
        : InvoiceStatus.UNPAID;

      const [updatedSubmission] = await Promise.all([
        tx.paymentSubmission.update({
          where: { id: submissionId },
          data: {
            status: newSubmissionStatus,
            reviewedBy: staffUserId,
            reviewedAt: new Date(),
            reviewNote: dto.reviewNote,
          },
        }),
        tx.invoice.update({
          where: { id: submission.invoiceId },
          data: {
            status: newInvoiceStatus,
            lockedAt: null,
          },
        }),
      ]);

      // If approved, fulfill any active promises
      if (dto.approved) {
        await tx.paymentPromise.updateMany({
          where: {
            invoiceId: submission.invoiceId,
            status: PaymentPromiseStatus.ACTIVE,
          },
          data: { status: PaymentPromiseStatus.FULFILLED },
        });
      }

      const parentUserIds = submission.invoice.student.parents.map(
        (sp) => sp.parent.user.id,
      );

      if (dto.approved) {
        this.events.emit(
          new PaymentApprovedEvent(
            tenantId,
            submission.invoiceId,
            dto.reviewNote ?? null,
            parentUserIds,
          ),
        );
      } else {
        this.events.emit(
          new PaymentRejectedEvent(
            tenantId,
            submission.invoiceId,
            dto.reviewNote ?? null,
            parentUserIds,
          ),
        );
      }

      return updatedSubmission;
    });
  }

  // ─── QUERIES ─────────────────────────────────────────────────────────────────

  async getPendingReviews(tenantId: string) {
    return this.prisma.paymentSubmission.findMany({
      where: { tenantId, status: PaymentSubmissionStatus.PENDING_REVIEW },
      include: {
        invoice: {
          select: {
            id: true,
            title: true,
            amount: true,
            dueDate: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                studentId: true,
                grade: { select: { name: true, code: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getSubmissionsForInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    return this.prisma.paymentSubmission.findMany({
      where: { invoiceId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPromisesForInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    return this.prisma.paymentPromise.findMany({
      where: { invoiceId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPromiseWithDetails(tenantId: string, promiseId: string) {
    const promise = await this.prisma.paymentPromise.findFirst({
      where: { id: promiseId, tenantId },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                parents: {
                  include: {
                    parent: {
                      include: { user: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!promise) throw new NotFoundException('Payment promise not found.');
    return promise;
  }

  async getPendingPromises(tenantId: string) {
    return this.prisma.paymentPromise.findMany({
      where: {
        tenantId,
        status: PaymentPromiseStatus.ACTIVE,
      },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                studentId: true,
                section: { select: { name: true } },
                grade: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getExpiringSoon(tenantId: string) {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    return this.prisma.paymentPromise.findMany({
      where: {
        tenantId,
        status: PaymentPromiseStatus.APPROVED,
        promisedDate: {
          lte: threeDaysFromNow,
          gte: new Date(),
        },
      },
      include: {
        invoice: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                studentId: true,
                section: { select: { name: true } },
                grade: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { promisedDate: 'asc' },
    });
  }

  async reviewPromise(
    tenantId: string,
    promiseId: string,
    dto: ReviewPromiseDto,
    staffUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const promise = await this.getPromiseWithDetails(tenantId, promiseId);

      const newStatus = dto.approved
        ? PaymentPromiseStatus.APPROVED
        : PaymentPromiseStatus.REFUSED;

      // If approving, extend the invoice due date
      let newDueDate: Date | undefined;
      if (dto.approved && promise.invoice?.dueDate) {
        newDueDate = promise.promisedDate;
      }

      const [updatedPromise, updatedInvoice] = await Promise.all([
        tx.paymentPromise.update({
          where: { id: promiseId },
          data: {
            status: newStatus,
            approvedBy: staffUserId,
            approvedAt: new Date(),
            approvalNote: dto.approvalNote,
          },
        }),
        dto.approved && promise.invoice
          ? tx.invoice.update({
              where: { id: promise.invoiceId },
              data: {
                gracePeriodApproved: newDueDate,
                dueDate: newDueDate,
              },
            })
          : Promise.resolve(null),
      ]);

      // Get parent userIds for notification
      const parentUserIds =
        promise.invoice?.student?.parents
          ?.map((sp) => sp.parent?.user?.id)
          .filter(Boolean) ?? [];

      const studentName = promise.invoice?.student
        ? `${promise.invoice.student.firstName} ${promise.invoice.student.lastName}`
        : 'Student';

      if (dto.approved) {
        this.events.emit(
          new GraceApprovedEvent(
            tenantId,
            promise.invoiceId,
            promise.promisedDate,
            studentName,
            parentUserIds,
            dto.approvalNote ?? null,
          ),
        );
      } else {
        this.events.emit(
          new GraceRefusedEvent(
            tenantId,
            promise.invoiceId,
            studentName,
            parentUserIds,
            dto.approvalNote ?? null,
          ),
        );
      }

      return { promise: updatedPromise, invoice: updatedInvoice };
    });
  }

  // ─── SCHEDULED JOBS ────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async markOverduePromises() {
    // Mark ACTIVE promises as OVERDUE if past their promised date
    await this.prisma.paymentPromise.updateMany({
      where: {
        status: PaymentPromiseStatus.ACTIVE,
        promisedDate: { lt: new Date() },
        invoice: {
          status: { not: InvoiceStatus.PAID },
        },
      },
      data: { status: PaymentPromiseStatus.OVERDUE },
    });

    // Mark APPROVED promises as OVERDUE if their extension date passed
    // and invoice is still unpaid
    await this.prisma.paymentPromise.updateMany({
      where: {
        status: PaymentPromiseStatus.APPROVED,
        promisedDate: { lt: new Date() },
        invoice: {
          status: { not: InvoiceStatus.PAID },
        },
      },
      data: { status: PaymentPromiseStatus.OVERDUE },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendOverdueReminders() {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { lt: new Date() },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            parents: {
              include: {
                parent: {
                  include: { user: true },
                },
              },
            },
          },
        },
      },
      take: 100, // Batch process
    });

    for (const invoice of overdueInvoices) {
      const parentUserIds =
        invoice.student?.parents
          ?.map((sp) => sp.parent?.user?.id)
          .filter(Boolean) ?? [];

      const studentName = invoice.student
        ? `${invoice.student.firstName} ${invoice.student.lastName}`
        : 'Student';

      this.events.emit(
        new OverdueReminderEvent(
          invoice.tenantId,
          invoice.id,
          studentName,
          parentUserIds,
          Number(invoice.amount) - Number(invoice.amountPaid || 0),
        ),
      );
    }
  }
}
