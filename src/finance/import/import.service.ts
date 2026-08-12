import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import { PaymentApprovedEvent } from '../../domain-events/events';
import {
  InvoiceStatus,
  PaymentPromiseStatus,
  PaymentSubmissionStatus,
} from '../../../prisma/generated/client';
import { Prisma } from '../../../prisma/generated/client';

export interface ImportRow {
  studentId: string; // student's school ID (e.g. "STU-001"), not UUID
  amount: string;
  dueDate: string;
  title: string;
  description?: string;
  category?: string;
  term?: string;
  currency?: string;
}

export interface ImportRowError {
  row: number;
  field: string;
  message: string;
}

export interface InvoiceImportPreview {
  valid: (ImportRow & { _studentUuid: string; _studentName: string })[];
  errors: ImportRowError[];
  totalAmount: number;
  totalCount: number;
}

export interface PaymentImportRow {
  invoiceId?: string;
  studentId?: string;
  title?: string;
  amount?: string;
  dueDate?: string;
  paymentAmount: string;
  paymentDate?: string;
  paymentMethod?: string;
  reference?: string;
}

export interface PaymentReconciliationRow {
  row: number;
  invoiceId: string;
  studentId: string;
  studentName: string;
  title: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  balanceBefore: number;
  paymentAmount: number;
  balanceAfter: number;
  paymentDate: string;
  paymentMethod?: string;
  reference?: string;
  resultingStatus: 'PAID' | 'PARTIALLY_PAID';
}

export interface PaymentReconciliationPreview {
  valid: PaymentReconciliationRow[];
  errors: ImportRowError[];
  skipped: number;
  totalRows: number;
  totalPaymentAmount: number;
  totalBalanceBefore: number;
  totalBalanceAfter: number;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly events: DomainEventsService,
  ) {}

  async parseAndPreview(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<InvoiceImportPreview> {
    const rows = this.parseFile(file);
    const preview: InvoiceImportPreview = {
      valid: [],
      errors: [],
      totalAmount: 0,
      totalCount: 0,
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      // Field-level validation
      const rowErrors: ImportRowError[] = [];

      if (!row.studentId?.trim()) {
        rowErrors.push({
          row: rowNum,
          field: 'studentId',
          message: 'studentId is required',
        });
      }
      if (!row.title?.trim()) {
        rowErrors.push({
          row: rowNum,
          field: 'title',
          message: 'title is required',
        });
      }
      if (!row.amount || !/^\d+(\.\d{1,2})?$/.test(String(row.amount).trim())) {
        rowErrors.push({
          row: rowNum,
          field: 'amount',
          message:
            'amount must be a positive number with up to 2 decimal places',
        });
      }
      if (!row.dueDate || isNaN(new Date(row.dueDate).getTime())) {
        rowErrors.push({
          row: rowNum,
          field: 'dueDate',
          message: 'dueDate is not a valid date',
        });
      }

      if (rowErrors.length > 0) {
        preview.errors.push(...rowErrors);
        continue;
      }

      // Resolve student by their school studentId within this tenant
      const student = await this.prisma.student.findFirst({
        where: { studentId: row.studentId.trim(), tenantId },
        select: { id: true, firstName: true, lastName: true },
      });

      if (!student) {
        preview.errors.push({
          row: rowNum,
          field: 'studentId',
          message: `No student found with ID "${row.studentId}" in this school`,
        });
        continue;
      }

      preview.valid.push({
        ...row,
        _studentUuid: student.id,
        _studentName: `${student.firstName} ${student.lastName}`,
      });
      preview.totalAmount += parseFloat(String(row.amount));
    }

    preview.totalCount = preview.valid.length;
    return preview;
  }

  async commitImport(
    tenantId: string,
    preview: InvoiceImportPreview,
    issuedBy: string,
  ) {
    if (preview.errors.length > 0) {
      throw new BadRequestException(
        `Cannot commit import: ${preview.errors.length} validation error(s) remain. Fix them and re-preview first.`,
      );
    }
    if (preview.valid.length === 0) {
      throw new BadRequestException('No valid rows to import.');
    }

    return this.invoicesService.createBulk(
      tenantId,
      {
        invoices: preview.valid.map((row) => ({
          studentId: row._studentUuid,
          title: row.title,
          description: row.description,
          amount: String(row.amount),
          dueDate: row.dueDate,
          term: row.term,
          category: row.category,
          currency: row.currency,
        })),
      },
      issuedBy,
    );
  }

  async previewPaymentReconciliation(
    tenantId: string,
    file: Express.Multer.File,
  ): Promise<PaymentReconciliationPreview> {
    const rows = this.parsePaymentFile(file);
    const preview: PaymentReconciliationPreview = {
      valid: [],
      errors: [],
      skipped: 0,
      totalRows: rows.length,
      totalPaymentAmount: 0,
      totalBalanceBefore: 0,
      totalBalanceAfter: 0,
    };

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        student: {
          select: {
            studentId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    const invoicesById = new Map(
      invoices.map((invoice) => [invoice.id, invoice]),
    );
    const seenInvoiceIds = new Set<string>();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;
      const paymentAmount = Number(row.paymentAmount);

      // A database-generated template contains every open invoice. Blank
      // paymentAmount cells are intentionally ignored so staff only edit paid rows.
      if (!row.paymentAmount?.trim()) {
        preview.skipped++;
        continue;
      }
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        preview.errors.push({
          row: rowNumber,
          field: 'paymentAmount',
          message: 'paymentAmount must be greater than zero',
        });
        continue;
      }

      let invoice = row.invoiceId
        ? invoicesById.get(row.invoiceId.trim())
        : undefined;

      // Backwards-compatible fallback for the supplied invoice template:
      // studentId + title + amount + dueDate must identify exactly one invoice.
      if (!invoice && !row.invoiceId && row.studentId) {
        const candidates = invoices.filter((candidate) => {
          if (
            candidate.student.studentId.trim().toLowerCase() !==
            row.studentId?.trim().toLowerCase()
          ) {
            return false;
          }
          if (
            row.title &&
            candidate.title.trim().toLowerCase() !==
              row.title.trim().toLowerCase()
          ) {
            return false;
          }
          if (row.amount && Number(candidate.amount) !== Number(row.amount)) {
            return false;
          }
          if (
            row.dueDate &&
            this.dateOnly(candidate.dueDate) !== this.dateOnly(row.dueDate)
          ) {
            return false;
          }
          return true;
        });

        if (candidates.length === 1) invoice = candidates[0];
        if (candidates.length > 1) {
          preview.errors.push({
            row: rowNumber,
            field: 'invoiceId',
            message:
              'Multiple invoices match this row. Download the payment template to use exact invoice IDs.',
          });
          continue;
        }
      }

      if (!invoice) {
        preview.errors.push({
          row: rowNumber,
          field: 'invoiceId',
          message: row.invoiceId
            ? `Invoice "${row.invoiceId}" was not found in this school`
            : 'No invoice matched this row. Download the payment template and use its invoiceId.',
        });
        continue;
      }
      if (seenInvoiceIds.has(invoice.id)) {
        preview.errors.push({
          row: rowNumber,
          field: 'invoiceId',
          message: 'This invoice appears more than once in the spreadsheet',
        });
        continue;
      }
      seenInvoiceIds.add(invoice.id);

      if (
        invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.CANCELLED
      ) {
        preview.errors.push({
          row: rowNumber,
          field: 'invoiceId',
          message:
            invoice.status === InvoiceStatus.PAID
              ? 'Invoice is already fully paid'
              : 'Cancelled invoices cannot receive payments',
        });
        continue;
      }

      const amountDue = Number(invoice.amount);
      const amountPaid = Number(invoice.amountPaid ?? 0);
      const balanceBefore = Math.max(0, amountDue - amountPaid);

      if (paymentAmount > balanceBefore) {
        preview.errors.push({
          row: rowNumber,
          field: 'paymentAmount',
          message: `Payment exceeds the current balance of ${balanceBefore.toFixed(2)} ${invoice.currency}`,
        });
        continue;
      }

      const balanceAfter = Math.max(0, balanceBefore - paymentAmount);
      const paymentDate = row.paymentDate?.trim()
        ? this.dateOnly(row.paymentDate)
        : this.dateOnly(new Date());
      if (Number.isNaN(new Date(`${paymentDate}T00:00:00Z`).getTime())) {
        preview.errors.push({
          row: rowNumber,
          field: 'paymentDate',
          message: 'paymentDate is not a valid date',
        });
        continue;
      }

      const validRow: PaymentReconciliationRow = {
        row: rowNumber,
        invoiceId: invoice.id,
        studentId: invoice.student.studentId,
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        title: invoice.title,
        currency: invoice.currency,
        amountDue,
        amountPaid,
        balanceBefore,
        paymentAmount,
        balanceAfter,
        paymentDate,
        paymentMethod: row.paymentMethod?.trim() || undefined,
        reference: row.reference?.trim() || undefined,
        resultingStatus: balanceAfter === 0 ? 'PAID' : 'PARTIALLY_PAID',
      };
      preview.valid.push(validRow);
      preview.totalPaymentAmount += paymentAmount;
      preview.totalBalanceBefore += balanceBefore;
      preview.totalBalanceAfter += balanceAfter;
    }

    return preview;
  }

  async commitPaymentReconciliation(
    tenantId: string,
    rows: PaymentReconciliationRow[],
    staffUserId: string,
  ) {
    if (!rows?.length) {
      throw new BadRequestException('No validated payment rows to confirm.');
    }

    const duplicateInvoiceId = rows.find(
      (row, index) =>
        rows.findIndex((candidate) => candidate.invoiceId === row.invoiceId) !==
        index,
    )?.invoiceId;
    if (duplicateInvoiceId) {
      throw new BadRequestException(
        `Invoice "${duplicateInvoiceId}" appears more than once.`,
      );
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        id: { in: rows.map((row) => row.invoiceId) },
      },
      include: {
        student: {
          include: {
            parents: { include: { parent: { include: { user: true } } } },
          },
        },
      },
    });
    const invoicesById = new Map(
      invoices.map((invoice) => [invoice.id, invoice]),
    );

    const plans = rows.map((row) => {
      const invoice = invoicesById.get(row.invoiceId);
      if (!invoice) {
        throw new BadRequestException(
          `Invoice "${row.invoiceId}" no longer exists.`,
        );
      }
      if (
        invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `Invoice "${row.invoiceId}" can no longer receive payments.`,
        );
      }

      const amountDue = Number(invoice.amount);
      const currentPaid = Number(invoice.amountPaid ?? 0);
      const currentBalance = Math.max(0, amountDue - currentPaid);
      const paymentAmount = Number(row.paymentAmount);
      if (
        !Number.isFinite(paymentAmount) ||
        paymentAmount <= 0 ||
        paymentAmount > currentBalance
      ) {
        throw new BadRequestException(
          `Invoice "${row.invoiceId}" changed after preview. Re-upload the sheet to refresh its balance.`,
        );
      }

      const newPaid = currentPaid + paymentAmount;
      const newBalance = Math.max(0, amountDue - newPaid);
      const isPaid = newBalance === 0;
      const paymentDateText = this.dateOnly(row.paymentDate);
      const note = [
        'Confirmed through Excel reconciliation.',
        `Payment date: ${paymentDateText}.`,
        row.reference ? `Reference: ${row.reference}.` : '',
      ]
        .filter(Boolean)
        .join(' ');

      return {
        row,
        invoice,
        paymentAmount,
        newPaid,
        newBalance,
        isPaid,
        paymentDate: new Date(`${paymentDateText}T12:00:00Z`),
        note,
      };
    });

    const events: Array<{
      invoiceId: string;
      parentUserIds: string[];
      reference?: string;
    }> = [];
    const batchSize = 50;
    for (let offset = 0; offset < plans.length; offset += batchSize) {
      const batch = plans.slice(offset, offset + batchSize);
      const reviewedAt = new Date();
      const invoiceIds = batch.map((plan) => plan.invoice.id);
      const fullyPaidInvoiceIds = batch
        .filter((plan) => plan.isPaid)
        .map((plan) => plan.invoice.id);

      await this.prisma.$transaction(
        async (tx) => {
          await tx.paymentSubmission.createMany({
            data: batch.map((plan) => ({
              tenantId,
              invoiceId: plan.invoice.id,
              submittedBy: staffUserId,
              amountClaimed: new Prisma.Decimal(plan.paymentAmount),
              status: PaymentSubmissionStatus.APPROVED,
              reviewedBy: staffUserId,
              reviewedAt,
              reviewNote: plan.note,
              note: plan.note,
            })),
          });

          await Promise.all(
            batch.map((plan) =>
              tx.invoice.update({
                where: { id: plan.invoice.id },
                data: {
                  amountPaid: new Prisma.Decimal(plan.newPaid),
                  status: plan.isPaid
                    ? InvoiceStatus.PAID
                    : InvoiceStatus.PARTIALLY_PAID,
                  paidAt: plan.isPaid ? plan.paymentDate : null,
                  lockedAt: null,
                  paymentMethod:
                    plan.row.paymentMethod?.trim() ||
                    plan.invoice.paymentMethod ||
                    null,
                },
              }),
            ),
          );

          await tx.paymentSubmission.updateMany({
            where: {
              invoiceId: { in: invoiceIds },
              status: PaymentSubmissionStatus.PENDING_REVIEW,
            },
            data: {
              status: PaymentSubmissionStatus.REJECTED,
              reviewedBy: staffUserId,
              reviewedAt,
              reviewNote: 'Superseded by Excel payment reconciliation.',
            },
          });

          if (fullyPaidInvoiceIds.length > 0) {
            await tx.paymentPromise.updateMany({
              where: {
                invoiceId: { in: fullyPaidInvoiceIds },
                status: {
                  in: [
                    PaymentPromiseStatus.ACTIVE,
                    PaymentPromiseStatus.APPROVED,
                  ],
                },
              },
              data: { status: PaymentPromiseStatus.FULFILLED },
            });
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

      events.push(
        ...batch.map((plan) => ({
          invoiceId: plan.invoice.id,
          reference: plan.row.reference,
          parentUserIds: plan.invoice.student.parents.map(
            (studentParent) => studentParent.parent.user.id,
          ),
        })),
      );
    }

    const result = {
      confirmed: plans.length,
      fullyPaid: plans.filter((plan) => plan.isPaid).length,
      partiallyPaid: plans.filter((plan) => !plan.isPaid).length,
      paymentTotal: plans.reduce(
        (total, plan) => total + plan.paymentAmount,
        0,
      ),
      remainingBalance: plans.reduce(
        (total, plan) => total + plan.newBalance,
        0,
      ),
    };

    for (const event of events) {
      if (event.parentUserIds.length > 0) {
        this.events.emit(
          new PaymentApprovedEvent(
            tenantId,
            event.invoiceId,
            event.reference
              ? `Payment reference: ${event.reference}`
              : 'Payment confirmed through Excel reconciliation.',
            event.parentUserIds,
          ),
        );
      }
    }

    return result;
  }

  generateTemplate(): Buffer {
    const wsData = [
      {
        studentId: 'STU-001',
        title: 'Term 3 Tuition Fee',
        amount: '150000',
        dueDate: '2026-05-31',
        description: 'Full term tuition fee',
        term: 'Term 3',
        category: 'Tuition',
        currency: 'RWF',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(wsData, { skipHeader: false });

    // Set column widths for readability
    ws['!cols'] = [
      { wch: 14 }, // studentId
      { wch: 24 }, // title
      { wch: 14 }, // amount
      { wch: 14 }, // dueDate
      { wch: 30 }, // description
      { wch: 12 }, // term
      { wch: 16 }, // category
      { wch: 12 }, // currency
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');

    const output: unknown = XLSX.write(wb, {
      type: 'buffer',
      bookType: 'xlsx',
    });
    if (!Buffer.isBuffer(output) && !(output instanceof Uint8Array)) {
      throw new BadRequestException('Could not generate the Excel template.');
    }
    return Buffer.from(output);
  }

  async generatePaymentReconciliationTemplate(
    tenantId: string,
  ): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: {
          in: [
            InvoiceStatus.UNPAID,
            InvoiceStatus.OVERDUE,
            InvoiceStatus.PARTIALLY_PAID,
            InvoiceStatus.PENDING_VERIFICATION,
          ],
        },
      },
      include: {
        student: {
          select: {
            studentId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
        { dueDate: 'asc' },
      ],
    });

    const rows = invoices.map((invoice) => {
      const amountDue = Number(invoice.amount);
      const amountPaid = Number(invoice.amountPaid ?? 0);
      return {
        invoiceId: invoice.id,
        studentId: invoice.student.studentId,
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        title: invoice.title,
        dueDate: this.dateOnly(invoice.dueDate),
        currency: invoice.currency,
        amountDue,
        amountPaid,
        balanceBefore: Math.max(0, amountDue - amountPaid),
        paymentAmount: '',
        paymentDate: this.dateOnly(new Date()),
        paymentMethod: '',
        reference: '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        'invoiceId',
        'studentId',
        'studentName',
        'title',
        'dueDate',
        'currency',
        'amountDue',
        'amountPaid',
        'balanceBefore',
        'paymentAmount',
        'paymentDate',
        'paymentMethod',
        'reference',
      ],
    });
    ws['!cols'] = [
      { wch: 38 },
      { wch: 16 },
      { wch: 24 },
      { wch: 28 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
    ];
    ws['!autofilter'] = { ref: `A1:M${Math.max(rows.length + 1, 1)}` };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    const instructions = XLSX.utils.aoa_to_sheet([
      ['Payment reconciliation instructions'],
      [
        'The Invoices sheet is generated from the current database. Do not change invoiceId, amountDue, amountPaid, or balanceBefore.',
      ],
      [
        'Enter paymentAmount only for invoices that received payment. Blank paymentAmount rows are ignored.',
      ],
      [
        'Partial payments are supported. paymentAmount cannot exceed balanceBefore.',
      ],
      [
        'paymentDate defaults to today. paymentMethod and reference are optional but recommended for audit.',
      ],
      [
        'Upload the completed workbook in Finance → Payments → Import Excel → Confirm payments.',
      ],
    ]);
    instructions['!cols'] = [{ wch: 110 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private parsePaymentFile(file: Express.Multer.File): PaymentImportRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException(
        'Could not parse file. Ensure it is a valid .xlsx or .csv file.',
      );
    }
    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase() === 'invoices') ??
      workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('File has no sheets.');

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: '', raw: false },
    );
    if (raw.length === 0) throw new BadRequestException('File is empty.');

    return raw.map((row) => {
      const text = (value: unknown): string => {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          return String(value).trim();
        }
        if (value instanceof Date) return this.dateOnly(value);
        return '';
      };
      const legacyAmount = text(row['amount'] ?? row['Amount']);
      return {
        invoiceId:
          text(row['invoiceId'] ?? row['invoice_id'] ?? row['Invoice ID']) ||
          undefined,
        studentId:
          text(row['studentId'] ?? row['student_id'] ?? row['Student ID']) ||
          undefined,
        title: text(row['title'] ?? row['Title']) || undefined,
        amount: legacyAmount || undefined,
        dueDate:
          text(row['dueDate'] ?? row['due_date'] ?? row['Due Date']) ||
          undefined,
        paymentAmount: text(
          row['paymentAmount'] ??
            row['payment_amount'] ??
            row['Payment Amount'] ??
            legacyAmount,
        ),
        paymentDate:
          text(
            row['paymentDate'] ?? row['payment_date'] ?? row['Payment Date'],
          ) || undefined,
        paymentMethod:
          text(
            row['paymentMethod'] ??
              row['payment_method'] ??
              row['Payment Method'],
          ) || undefined,
        reference:
          text(
            row['reference'] ??
              row['paymentReference'] ??
              row['Payment Reference'],
          ) || undefined,
      };
    });
  }

  private dateOnly(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime())
      ? text
      : parsed.toISOString().slice(0, 10);
  }

  private parseFile(file: Express.Multer.File): ImportRow[] {
    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException(
        'Could not parse file. Ensure it is a valid .xlsx or .csv file.',
      );
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('File has no sheets.');

    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: '',
      raw: false,
    });

    if (raw.length === 0) throw new BadRequestException('File is empty.');

    // Normalise column names to camelCase
    return raw.map((r) => ({
      studentId: String(
        r['studentId'] ?? r['student_id'] ?? r['Student ID'] ?? '',
      ).trim(),
      title: String(r['title'] ?? r['Title'] ?? '').trim(),
      description:
        String(r['description'] ?? r['Description'] ?? '').trim() || undefined,
      amount: String(r['amount'] ?? r['Amount'] ?? '').trim(),
      dueDate: String(
        r['dueDate'] ?? r['due_date'] ?? r['Due Date'] ?? '',
      ).trim(),
      term: String(r['term'] ?? r['Term'] ?? '').trim() || undefined,
      category:
        String(r['category'] ?? r['Category'] ?? '').trim() || undefined,
      currency:
        String(r['currency'] ?? r['Currency'] ?? '').trim() || undefined,
    }));
  }
}
