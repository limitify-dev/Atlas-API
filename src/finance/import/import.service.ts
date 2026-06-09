import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

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

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
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
