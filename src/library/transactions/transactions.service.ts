import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IssueBookDto, ReturnBookDto, IssueBulkDto } from './dto/transaction.dto';
import { Prisma, BookStatus } from '../../../prisma/generated/client';
import { PushService } from '../../communications/push/push.service';

@Injectable()
export class BookTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {}

  async issue(issueDto: IssueBookDto) {
    const copy = await this.prisma.bookCopy.findUnique({
      where: {
        tenantId_code: { tenantId: issueDto.tenantId, code: issueDto.bookCopyCode },
      },
      include: { book: true },
    });
    if (!copy) throw new NotFoundException('Book copy not found');
    if (copy.status !== BookStatus.AVAILABLE) throw new BadRequestException('Book copy is not available');

    if (!issueDto.studentId && !issueDto.sectionId) {
        throw new BadRequestException('Student ID or Class/Section ID is required');
    }

    const txn = await this.prisma.bookTransaction.create({
      data: {
        tenantId: issueDto.tenantId,
        studentId: issueDto.studentId,
        sectionId: issueDto.sectionId,
        bookId: copy.bookId,
        bookCopyId: copy.id,
        dueDate: new Date(issueDto.dueDate),
        remarks: issueDto.remarks,
        issueDate: issueDto.issueDate ? new Date(issueDto.issueDate) : new Date(),
      },
    });

    await this.prisma.bookCopy.update({
      where: { id: copy.id },
      data: { status: BookStatus.ISSUED },
    });

    await this.updateBookCounts(copy.bookId);
    return txn;
  }

  async issueBulk(issueBulkDto: IssueBulkDto) {
    if (!issueBulkDto.studentId && !issueBulkDto.sectionId) {
      throw new BadRequestException('Student ID or Class/Section ID is required');
    }

    const availableCopies = await this.prisma.bookCopy.findMany({
      where: {
        bookId: issueBulkDto.bookId,
        status: BookStatus.AVAILABLE,
        tenantId: issueBulkDto.tenantId,
      },
      take: issueBulkDto.quantity,
    });

    if (availableCopies.length < issueBulkDto.quantity) {
      throw new BadRequestException(`Not enough available copies. Found ${availableCopies.length}, requested ${issueBulkDto.quantity}`);
    }

    const dueDate = new Date(issueBulkDto.dueDate);
    const issueDate = issueBulkDto.issueDate ? new Date(issueBulkDto.issueDate) : new Date();

    const transactions = availableCopies.map(copy => ({
      tenantId: issueBulkDto.tenantId,
      studentId: issueBulkDto.studentId,
      sectionId: issueBulkDto.sectionId,
      bookId: copy.bookId,
      bookCopyId: copy.id,
      dueDate,
      issueDate,
      returnDate: null,
      remarks: issueBulkDto.remarks,
    }));

    // Perform transaction with concurrency check
    await this.prisma.$transaction(async (tx) => {
        const updateResult = await tx.bookCopy.updateMany({
            where: { 
                id: { in: availableCopies.map(c => c.id) },
                status: BookStatus.AVAILABLE 
            },
            data: { status: BookStatus.ISSUED },
        });

        if (updateResult.count !== availableCopies.length) {
            throw new BadRequestException('Some copies became unavailable during processing. Please try again.');
        }

        await tx.bookTransaction.createMany({
            data: transactions,
        });
    });

    // Update counts
    await this.updateBookCounts(issueBulkDto.bookId);

    return { count: transactions.length, message: 'Books issued successfully' };
  }

  async return(returnDto: ReturnBookDto) {
    const copy = await this.prisma.bookCopy.findUnique({
      where: {
        tenantId_code: { tenantId: returnDto.tenantId, code: returnDto.bookCopyCode },
      },
    });
    if (!copy) throw new NotFoundException('Book copy not found');

    const txn = await this.prisma.bookTransaction.findFirst({
      where: {
        bookCopyId: copy.id,
        returnDate: null,
      },
    });
    if (!txn) throw new NotFoundException('No active transaction found for this book copy');

    const returnDate = returnDto.returnDate ? new Date(returnDto.returnDate) : new Date();

    const updatedTxn = await this.prisma.bookTransaction.update({
      where: { id: txn.id },
      data: {
        returnDate,
        fine: returnDto.fine || 0,
        remarks: returnDto.remarks,
      },
    });

    await this.prisma.bookCopy.update({
      where: { id: copy.id },
      data: { status: BookStatus.AVAILABLE },
    });

    await this.updateBookCounts(copy.bookId);

    return { message: 'Book returned successfully', txnId: txn.id, transaction: updatedTxn };
  }

  async reportMissing(tenantId: string, transactionId: string) {
    const txn = await this.prisma.bookTransaction.findUnique({
      where: { id: transactionId },
      include: {
        book: true,
        bookCopy: true,
        student: {
          include: {
            parents: {
              include: {
                parent: {
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
    
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.tenantId !== tenantId) throw new BadRequestException('Transaction does not belong to this tenant');
    if (txn.returnDate) throw new BadRequestException('Book already returned');
    if (!txn.bookCopyId) throw new BadRequestException('Book copy is missing on this transaction');

    await this.prisma.bookCopy.update({
        where: { id: txn.bookCopyId },
        data: { status: BookStatus.LOST }
    });
    
    const missingRemarks = txn.remarks?.includes('Reported Missing')
      ? txn.remarks
      : txn.remarks
        ? `${txn.remarks} | Reported Missing`
        : 'Reported Missing';

    // Missing-book invoice value is the book price.
    await this.prisma.bookTransaction.update({
        where: { id: transactionId },
        data: {
          fine: txn.book?.price || txn.fine || 0,
          remarks: missingRemarks,
        }
    });

    const parentUserIds = Array.from(
      new Set(
        (txn.student?.parents || [])
          .map((sp) => sp.parent?.userId)
          .filter((id): id is string => !!id),
      ),
    );

    if (parentUserIds.length > 0) {
      const amount = Number(txn.book?.price || txn.fine || 0);
      const studentName = txn.student
        ? `${txn.student.firstName} ${txn.student.lastName}`.trim()
        : 'Your child';
      const bookTitle = txn.book?.title || 'a borrowed book';

      this.pushService
        .sendToUsers(
          parentUserIds,
          'Library Invoice Generated',
          `${studentName} was marked missing ${bookTitle}. Invoice: $${amount.toFixed(2)}.`,
          {
            type: 'library_missing_invoice',
            transactionId: txn.id,
            studentId: txn.studentId,
            studentName,
            amount,
            currency: 'USD',
            bookId: txn.bookId,
            bookTitle,
            bookCopyCode: txn.bookCopy?.code || '',
          },
        )
        .catch(() => null);
    }

    return { success: true, message: 'Book marked as missing' };
  }

  async returnBulk(returnBulkDto: { tenantId: string; copyCodes: string[]; returnDate?: Date | string }) {
      const results = await Promise.all(returnBulkDto.copyCodes.map(async (code) => {
          try {
              await this.return({ 
                  tenantId: returnBulkDto.tenantId, 
                  bookCopyCode: code, 
                  returnDate: new Date(returnBulkDto.returnDate || new Date()).toISOString()
              });
              return { code, success: true };
          } catch (e: any) {
              return { code, success: false, error: e.message };
          }
      }));
      return { 
          processed: results.length, 
          success: results.filter(r => r.success).length, 
          failed: results.filter(r => !r.success),
          message: 'Bulk return processed'
      };
  }

  async getOverdue(params: { tenantId: string; page?: number; pageSize?: number }) {
    const { tenantId, page = 1, pageSize = 10 } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BookTransactionWhereInput = {
      tenantId,
      returnDate: null,
      dueDate: { lt: new Date() },
    };

    const [transactions, total] = await Promise.all([
      this.prisma.bookTransaction.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          book: true,
          bookCopy: true,
          student: {
            include: { grade: true, section: true },
          },
          section: true,
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.bookTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getActiveLoans(params: { tenantId: string; page?: number; pageSize?: number; sectionId?: string; studentId?: string; bookId?: string; excludeOverdue?: boolean; search?: string }) {
    const { tenantId, page = 1, pageSize = 10, sectionId, studentId, bookId, excludeOverdue, search } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BookTransactionWhereInput = {
      tenantId,
      returnDate: null,
      ...(excludeOverdue ? { dueDate: { gte: new Date() } } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(bookId ? { bookId } : {}),
      ...(search ? {
          OR: [
              { student: { firstName: { contains: search, mode: 'insensitive' } } },
              { student: { lastName: { contains: search, mode: 'insensitive' } } },
              { section: { name: { contains: search, mode: 'insensitive' } } },
          ]
      } : {}),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.bookTransaction.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          book: true,
          bookCopy: true,
          student: {
            include: { grade: true, section: true },
          },
          section: true,
        },
        orderBy: { issueDate: 'desc' },
      }),
      this.prisma.bookTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getActiveLoansGrouped(params: { tenantId: string; page?: number; pageSize?: number; sectionId?: string; studentId?: string; bookId?: string; excludeOverdue?: boolean; search?: string }) {
    const { tenantId, page = 1, pageSize = 10, sectionId, studentId, bookId, excludeOverdue, search } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BookTransactionWhereInput = {
      tenantId,
      returnDate: null,
      ...(excludeOverdue ? { dueDate: { gte: new Date() } } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(bookId ? { bookId } : {}),
      ...(search ? {
          OR: [
              { student: { firstName: { contains: search, mode: 'insensitive' } } },
              { student: { lastName: { contains: search, mode: 'insensitive' } } },
              { section: { name: { contains: search, mode: 'insensitive' } } },
          ]
      } : {}),
    };

    // Calculate total groups
    // Since prisma doesn't support count distinct groups easily without raw sql or grouping all
    // We will attempt to group and paginate using prisma groupBy.
    // However, getting total count of groups is tricky cleanly.
    // We can fetch all groups minimal data to count? Or use raw query.
    // For simplicity, we'll fetch groups with skip/take
    
    // Grouping by studentId, sectionId, bookId
    const groups = await this.prisma.bookTransaction.groupBy({
        by: ['studentId', 'sectionId', 'bookId'],
        where,
        _count: { _all: true },
        orderBy: [
            { sectionId: 'asc' },
            { studentId: 'asc' },
            { bookId: 'asc' }
        ],
        skip,
        take: pageSize,
    });

    // To get total count of groups, we unfortunately need a separate count query or fetch all groups length
    // Fetching all might be heavy if thousands of groups. But usually not millions.
    // Using raw query for count(distinct ...) is cleaner but prisma types...
    // Let's optimize: fetch distinct combinations count via raw query or just fetch all groups (ids only)
    // Actually, `groupBy` doesn't support returning count directly.
    // We'll use a second query to get total count by grouping all (without skip/take) but select minimal.
    // Or just fetch all groups if dataset is small. If large, performance hit.
    // Let's use `count` on a distinct query? Prisma `findMany({ distinct: [...] })` returns list.
    // `count({ distinct: [...] })` is not supported.
    // We will do a separate groupBy without pagination to get total count (for now).
    const allGroups = await this.prisma.bookTransaction.groupBy({
        by: ['studentId', 'sectionId', 'bookId'],
        where,
        _count: { _all: true },
    });
    const total = allGroups.length;

    // Fetch details for the page groups
    const bookIds = [...new Set(groups.map(g => g.bookId))];
    const studentIds = [...new Set(groups.map(g => g.studentId!).filter(Boolean))];
    const sectionIds = [...new Set(groups.map(g => g.sectionId!).filter(Boolean))];

    const [books, students, sections] = await Promise.all([
        this.prisma.book.findMany({ where: { id: { in: bookIds } } }),
        this.prisma.student.findMany({ where: { id: { in: studentIds } }, include: { grade: true, section: true } }),
        this.prisma.section.findMany({ where: { id: { in: sectionIds } }, include: { grade: true } }),
    ]);

    // Also fetch the specific copy codes for these groups to show details?
    // Maybe user wants to see codes.
    // We can fetch transactions for these groups.
    // But it might be many transactions per group.
    // Let's just return count and maybe basic info. The frontend can request details if expanded.
    // Or fetch codes too.
    
    // Construct rich response
    const data = await Promise.all(groups.map(async (group) => {
        const book = books.find(b => b.id === group.bookId);
        const student = group.studentId ? students.find(s => s.id === group.studentId) : null;
        const section = group.sectionId ? sections.find(s => s.id === group.sectionId) : null;
        
        // Fetch copy codes for this group securely
        const txs = await this.prisma.bookTransaction.findMany({
            where: {
                tenantId,
                returnDate: null,
                ...(excludeOverdue ? { dueDate: { gte: new Date() } } : {}),
                bookId: group.bookId,
                studentId: group.studentId || undefined,
                sectionId: group.sectionId || undefined,
                // Ensure correct matching for nulls
                ...(group.studentId ? {} : { studentId: null }),
                ...(group.sectionId ? {} : { sectionId: null }),
            },
            select: { id: true, bookCopy: { select: { code: true } }, issueDate: true, dueDate: true },
        });

        return {
            id: `${group.studentId || 'null'}-${group.sectionId || 'null'}-${group.bookId}`, // Synthetic ID
            count: group._count._all,
            book,
            student,
            section,
            transactions: txs.map(t => ({ 
                id: t.id, 
                code: t.bookCopy?.code || 'N/A',
                issueDate: t.issueDate,
                dueDate: t.dueDate 
            })),
            issueDate: txs[0]?.issueDate, // Representative date
            dueDate: txs[0]?.dueDate,
        };
    }));

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getStudentHistory(tenantId: string, studentId: string) {
    return this.prisma.bookTransaction.findMany({
      where: { tenantId, studentId },
      include: { book: true, bookCopy: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  async getStats(tenantId: string) {
    const totalBooks = await this.prisma.book.count({ where: { tenantId } });
    const totalCopies = await this.prisma.bookCopy.count({ where: { tenantId } });
    const issuedCopies = await this.prisma.bookCopy.count({ where: { tenantId, status: BookStatus.ISSUED } });
    const overdue = await this.prisma.bookTransaction.count({
        where: { tenantId, returnDate: null, dueDate: { lt: new Date() } },
    });

    // Category Distribution
    const categoryGroups = await this.prisma.book.groupBy({
        by: ['category'],
        _count: { category: true },
        where: { tenantId },
    });
    const categoryDistribution = categoryGroups.map(g => ({
        name: g.category,
        value: g._count.category,
    }));

    // Top Borrowed Books
    const topBooksGroups = await this.prisma.bookTransaction.groupBy({
        by: ['bookId'],
        _count: { bookId: true },
        where: { tenantId },
        orderBy: { _count: { bookId: 'desc' } },
        take: 5,
    });
    
    const topBooksDetails = await this.prisma.book.findMany({
        where: { id: { in: topBooksGroups.map(g => g.bookId) } },
        select: { id: true, title: true },
    });
    
    const topBooks = topBooksGroups.map(g => {
        const book = topBooksDetails.find(b => b.id === g.bookId);
        return {
            title: book?.title || 'Unknown',
            count: g._count.bookId,
        };
    });

    const topStudentsGroups = await this.prisma.bookTransaction.groupBy({
        by: ['studentId'],
        _count: { studentId: true },
        where: { tenantId, studentId: { not: null } },
        orderBy: { _count: { studentId: 'desc' } },
        take: 5,
    });

    const topSectionsGroups = await this.prisma.bookTransaction.groupBy({
        by: ['sectionId'],
        _count: { sectionId: true },
        where: { tenantId, sectionId: { not: null } },
        orderBy: { _count: { sectionId: 'desc' } },
        take: 5,
    });

    const [topStudentsDetails, topSectionsDetails] = await Promise.all([
        this.prisma.student.findMany({
            where: { id: { in: topStudentsGroups.map(g => g.studentId as string) } },
            select: { id: true, firstName: true, lastName: true },
        }),
        this.prisma.section.findMany({
            where: { id: { in: topSectionsGroups.map(g => g.sectionId as string) } },
            select: { id: true, name: true },
        }),
    ]);

    const combinedBorrowers = [
        ...topStudentsGroups.map(g => {
            const student = topStudentsDetails.find(s => s.id === g.studentId);
            return {
                name: student ? `${student.firstName} ${student.lastName}` : 'Unknown Student',
                count: g._count.studentId,
            };
        }),
        ...topSectionsGroups.map(g => {
            const section = topSectionsDetails.find(s => s.id === g.sectionId);
            return {
                name: section ? `Class ${section.name}` : 'Unknown Class',
                count: g._count.sectionId,
            };
        }),
    ];

    const topBorrowers = combinedBorrowers
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        totalBooks,
        totalCopies,
        issuedCopies,
        overdueCount: overdue,
        categoryDistribution,
        topBooks,
        topBorrowers,
    };
  }

  private async updateBookCounts(bookId: string) {
    const total = await this.prisma.bookCopy.count({
      where: { bookId },
    });
    const available = await this.prisma.bookCopy.count({
      where: { bookId, status: BookStatus.AVAILABLE },
    });

    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        totalCopies: total,
        availableCopies: available,
        status: available > 0 ? BookStatus.AVAILABLE : BookStatus.ISSUED,
      },
    });
  }
}
