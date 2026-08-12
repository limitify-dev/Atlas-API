import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import { InvoiceStatus } from '../../../prisma/generated/client';
import {
  BulkCreateInvoiceDto,
  BulkCreateResult,
  CreateInvoiceDto,
  FeeScope,
  InvoiceFiltersDto,
  PostFeeDto,
  PostFeeResult,
} from '../dto';
import {
  InvoiceCreatedEvent,
  InvoicesBulkCreatedEvent,
  OverdueReminderEvent,
} from '../../domain-events/events';
import { Prisma } from '../../../prisma/generated/client';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async createOne(tenantId: string, dto: CreateInvoiceDto, issuedBy: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: {
        parents: { include: { parent: { include: { user: true } } } },
      },
    });

    if (!student)
      throw new NotFoundException('Student not found in this tenant.');

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        studentId: dto.studentId,
        title: dto.title,
        description: dto.description,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'USD',
        dueDate: new Date(dto.dueDate),
        term: dto.term,
        category: dto.category,
        issuedBy,
      },
    });

    const parentUserIds = student.parents.map((sp) => sp.parent.user.id);
    const studentName = `${student.firstName} ${student.lastName}`;

    this.events.emit(
      new InvoiceCreatedEvent(
        tenantId,
        invoice.id,
        student.id,
        studentName,
        invoice.title,
        Number(invoice.amount),
        invoice.dueDate,
        parentUserIds,
      ),
    );

    return invoice;
  }

  async createBulk(
    tenantId: string,
    dto: BulkCreateInvoiceDto,
    issuedBy: string,
  ): Promise<BulkCreateResult> {
    const result: BulkCreateResult = { created: 0, failed: 0, errors: [] };

    for (let i = 0; i < dto.invoices.length; i++) {
      const item = dto.invoices[i];
      try {
        await this.createOne(tenantId, item, issuedBy);
        result.created++;
      } catch (err: any) {
        result.failed++;
        result.errors.push({
          index: i,
          studentId: item.studentId,
          reason: err.message,
        });
      }
    }

    if (result.created > 0) {
      const firstItem = dto.invoices[0];
      this.events.emit(
        new InvoicesBulkCreatedEvent(
          tenantId,
          result.created,
          firstItem.term,
          firstItem.category,
        ),
      );
    }

    return result;
  }

  async postFee(
    tenantId: string,
    dto: PostFeeDto,
    issuedBy: string,
  ): Promise<PostFeeResult> {
    // Resolve the target student list based on scope
    const studentWhere: any = { tenantId };

    if (dto.scope === FeeScope.SECTION) {
      studentWhere.sectionId = dto.sectionId;
    } else if (dto.scope === FeeScope.SECTIONS) {
      studentWhere.sectionId = { in: dto.sectionIds };
    } else if (dto.scope === FeeScope.GRADE) {
      studentWhere.gradeId = dto.gradeId;
    } else if (dto.scope === FeeScope.STUDENTS) {
      studentWhere.id = { in: dto.studentIds };
    }

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: { id: true },
    });

    if (students.length === 0) {
      throw new BadRequestException('No students found for the given scope.');
    }

    const feeBase: Omit<CreateInvoiceDto, 'studentId'> = {
      title: dto.title,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency,
      dueDate: dto.dueDate,
      term: dto.term,
      category: dto.category,
    };

    const bulkDto: BulkCreateInvoiceDto = {
      invoices: students.map((s) => ({ ...feeBase, studentId: s.id })),
    };

    const bulk = await this.createBulk(tenantId, bulkDto, issuedBy);

    return {
      scope: dto.scope,
      targeted: students.length,
      created: bulk.created,
      failed: bulk.failed,
      errors: bulk.errors,
    };
  }

  async findAll(tenantId: string, filters: InvoiceFiltersDto) {
    const {
      page = 1,
      limit = 20,
      status,
      studentId,
      term,
      category,
      archived,
      dueBefore,
      dueAfter,
      sectionId,
      gradeId,
    } = filters;

    const where: any = { tenantId };
    where.archivedAt = archived ? { not: null } : null;
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;
    if (term) where.term = term;
    if (category) where.category = category;
    if (dueBefore || dueAfter) {
      where.dueDate = {};
      if (dueBefore) where.dueDate.lte = new Date(dueBefore);
      if (dueAfter) where.dueDate.gte = new Date(dueAfter);
    }
    if (sectionId || gradeId) {
      where.student = {};
      if (sectionId) where.student.sectionId = sectionId;
      if (gradeId) where.student.gradeId = gradeId;
    }

    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentId: true,
              grade: { select: { id: true, name: true, code: true } },
              section: { select: { id: true, name: true } },
            },
          },
          submissions: {
            select: { id: true, note: true },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSummary(tenantId: string) {
    const [totalInvoices, paidAmountResult, outstandingTotalResult, paidInvoices, pendingInvoices, overdueAccounts] =
      await Promise.all([
        this.prisma.invoice.count({ where: { tenantId, archivedAt: null } }),
        this.prisma.invoice.aggregate({
          _sum: { amountPaid: true },
          where: { tenantId, status: InvoiceStatus.PAID, archivedAt: null },
        }),
        this.prisma.invoice.aggregate({
          _sum: { amount: true },
          where: {
            tenantId,
            status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] },
            archivedAt: null,
          },
        }),
        this.prisma.invoice.count({ where: { tenantId, status: InvoiceStatus.PAID, archivedAt: null } }),
        this.prisma.invoice.count({
          where: {
            tenantId,
            status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED] },
            archivedAt: null,
          },
        }),
        this.prisma.invoice.count({
          where: {
            tenantId,
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] },
            dueDate: { lt: new Date() },
            archivedAt: null,
          },
        }),
      ]);

    return {
      totalInvoices,
      paidAmount: Number(paidAmountResult._sum.amountPaid ?? 0),
      outstandingTotal: Number(outstandingTotalResult._sum.amount ?? 0),
      pendingAmount: Number(outstandingTotalResult._sum.amount ?? 0),
      overdueAccounts,
      promiseToPay: 0,
      reminderDeliveryRate: 0,
      paidInvoices,
      pendingInvoices,
    };
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentId: true,
            grade: { select: { id: true, name: true, code: true } },
            section: { select: { id: true, name: true } },
          },
        },
        submissions: {
          orderBy: { createdAt: 'desc' },
        },
        promises: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  async findForParent(
    tenantId: string,
    parentUserId: string,
    filters: InvoiceFiltersDto,
  ) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId: parentUserId, tenantId },
      include: { children: { select: { studentId: true } } },
    });

    if (!parent) throw new NotFoundException('Parent profile not found.');

    const studentIds = parent.children.map((c) => c.studentId);
    return this.findAll(tenantId, {
      ...filters,
      studentId: studentIds.length > 0 ? studentIds : undefined,
    });
  }

  async cancel(tenantId: string, id: string, _staffUserId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot cancel a paid invoice.');
    }
    if (invoice.status === InvoiceStatus.PENDING_VERIFICATION) {
      throw new ConflictException(
        'Invoice is under review. Reject the submission first before cancelling.',
      );
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }

  async remove(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException(
        'Cannot delete a paid invoice. Cancel or archive it instead.',
      );
    }
    if (invoice.status === InvoiceStatus.PENDING_VERIFICATION) {
      throw new ConflictException(
        'Invoice is under review. Reject the submission first before deleting.',
      );
    }

    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true, id };
  }

  async bulkDelete(tenantId: string, invoiceIds: string[]) {
    if (!invoiceIds?.length) {
      throw new BadRequestException('invoiceIds must be a non-empty array.');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId },
      select: { id: true, status: true },
    });

    const deletableIds = invoices
      .filter(
        (i) =>
          i.status !== InvoiceStatus.PAID &&
          i.status !== InvoiceStatus.PENDING_VERIFICATION,
      )
      .map((i) => i.id);
    const skipped = invoices.length - deletableIds.length;

    if (deletableIds.length > 0) {
      await this.prisma.invoice.deleteMany({
        where: { id: { in: deletableIds }, tenantId },
      });
    }

    return {
      requested: invoiceIds.length,
      deleted: deletableIds.length,
      skipped,
      notFound: invoiceIds.length - invoices.length,
    };
  }

  async bulkArchive(tenantId: string, invoiceIds: string[]) {
    if (!invoiceIds?.length) {
      throw new BadRequestException('invoiceIds must be a non-empty array.');
    }

    const result = await this.prisma.invoice.updateMany({
      where: { id: { in: invoiceIds }, tenantId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    return { requested: invoiceIds.length, archived: result.count };
  }

  async bulkUnarchive(tenantId: string, invoiceIds: string[]) {
    if (!invoiceIds?.length) {
      throw new BadRequestException('invoiceIds must be a non-empty array.');
    }

    const result = await this.prisma.invoice.updateMany({
      where: { id: { in: invoiceIds }, tenantId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    return { requested: invoiceIds.length, unarchived: result.count };
  }

  async update(
    tenantId: string,
    id: string,
    dto: {
      amount?: number;
      currency?: string;
      dueDate?: string;
      description?: string;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');

    const updateData: any = {};
    if (dto.amount !== undefined)
      updateData.amount = new Prisma.Decimal(dto.amount);
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.dueDate !== undefined) updateData.dueDate = new Date(dto.dueDate);
    if (dto.description !== undefined) updateData.description = dto.description;

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  /** Used by the overdue promise job to check if invoice is still unpaid */
  async getUnpaidInvoiceIds(
    tenantId: string,
    ids: string[],
  ): Promise<string[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: ids }, tenantId, status: { not: InvoiceStatus.PAID } },
      select: { id: true },
    });
    return invoices.map((i) => i.id);
  }

  async getSummaryForStudent(tenantId: string, studentId: string) {
    const [total, paid, pending, overdue] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId, studentId } }),
      this.prisma.invoice.count({
        where: { tenantId, studentId, status: InvoiceStatus.PAID },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          studentId,
          status: {
            in: [InvoiceStatus.UNPAID, InvoiceStatus.PENDING_VERIFICATION],
          },
        },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          studentId,
          status: InvoiceStatus.UNPAID,
          dueDate: { lt: new Date() },
        },
      }),
    ]);
    return { total, paid, pending, overdue };
  }

  async sendReminder(
    tenantId: string,
    invoiceId: string,
    channel: 'sms' | 'email' | 'both',
    customMessage?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        student: {
          include: {
            parents: {
              include: { parent: { include: { user: true } } },
            },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');

    const parentUserIds =
      invoice.student?.parents
        ?.map((sp) => sp.parent?.user?.id)
        .filter(Boolean) ?? [];

    const studentName = invoice.student
      ? `${invoice.student.firstName} ${invoice.student.lastName}`
      : 'Student';

    this.events.emit(
      new OverdueReminderEvent(
        tenantId,
        invoiceId,
        studentName,
        parentUserIds,
        Number(invoice.amount) - Number(invoice.amountPaid || 0),
        channel,
        customMessage,
      ),
    );

    return { success: true, sentTo: parentUserIds.length };
  }

  async sendReminders(
    tenantId: string,
    invoiceIds: string[],
    channel: 'sms' | 'email' | 'both',
    customMessage?: string,
  ) {
    if (!invoiceIds?.length) {
      throw new BadRequestException('invoiceIds must be a non-empty array.');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, tenantId },
      include: {
        student: {
          include: {
            parents: {
              include: { parent: { include: { user: true } } },
            },
          },
        },
      },
    });

    const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const notFound = invoiceIds.filter((id) => !invoiceMap.has(id)).length;
    let processed = 0;

    for (const invoiceId of invoiceIds) {
      const invoice = invoiceMap.get(invoiceId);
      if (!invoice) continue;

      const parentUserIds =
        invoice.student?.parents
          ?.map((sp) => sp.parent?.user?.id)
          .filter(Boolean) ?? [];

      const studentName = invoice.student
        ? `${invoice.student.firstName} ${invoice.student.lastName}`
        : 'Student';

      this.events.emit(
        new OverdueReminderEvent(
          tenantId,
          invoice.id,
          studentName,
          parentUserIds,
          Number(invoice.amount) - Number(invoice.amountPaid || 0),
          channel,
          customMessage,
        ),
      );
      processed++;
    }

    return {
      requested: invoiceIds.length,
      processed,
      notFound,
    };
  }

  async bulkUpdate(
    tenantId: string,
    invoiceIds: string[],
    dto: {
      amount?: number;
      currency?: string;
      dueDate?: string;
      description?: string;
    },
  ) {
    if (!invoiceIds?.length) {
      throw new BadRequestException('invoiceIds must be a non-empty array.');
    }

    const data: any = {};
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.dueDate !== undefined) data.dueDate = new Date(dto.dueDate);
    if (dto.description !== undefined) data.description = dto.description;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one update field must be provided.');
    }

    const result = await this.prisma.invoice.updateMany({
      where: { id: { in: invoiceIds }, tenantId },
      data,
    });

    return {
      requested: invoiceIds.length,
      updated: result.count,
    };
  }
}
