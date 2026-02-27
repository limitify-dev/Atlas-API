import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookDto, UpdateBookDto, CreateBookCopyDto } from './dto/create-book.dto';
import { Prisma, BookStatus } from '../../../prisma/generated/client';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  private getPrefix(title: string): string {
    const words = title.replace(/[^\w\s]/gi, '').split(/\s+/).filter(w => w.length > 0);
    let prefix = 'UNK';
    if (words.length >= 3) {
        prefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
    } else if (words.length > 0) {
        prefix = words[0].substring(0, 3).toUpperCase().padEnd(3, 'X');
    }
    return prefix;
  }

  private async getUniquePrefix(tenantId: string, title: string, bookId?: string): Promise<string> {
    let base = this.getPrefix(title);
    let prefix = base;
    let counter = 2;
    
    while (true) {
        // Check if this prefix is used by ANY other book
        const collision = await this.prisma.bookCopy.findFirst({
            where: { 
                tenantId,
                code: { startsWith: `${prefix}-` },
                bookId: bookId ? { not: bookId } : undefined
            },
            select: { id: true }
        });
        
        if (!collision) return prefix;
        
        prefix = `${base}${counter}`;
        counter++;
    }
  }

  async create(createBookDto: CreateBookDto) {
    const { numberOfCopies, ...bookData } = createBookDto;
    
    const prefix = await this.getUniquePrefix(createBookDto.tenantId, createBookDto.title);
    const copiesData: any[] = [];
    if (numberOfCopies && numberOfCopies > 0) {
        for (let i = 0; i < numberOfCopies; i++) {
            copiesData.push({
                tenantId: createBookDto.tenantId,
                code: `${prefix}-${(i + 1).toString().padStart(4, '0')}`,
                status: BookStatus.AVAILABLE
            });
        }
    }

    const book = await this.prisma.book.create({
      data: {
        ...bookData,
        totalCopies: numberOfCopies || 0,
        availableCopies: numberOfCopies || 0,
        copies: {
          create: copiesData,
        },
      },
      include: {
        _count: {
          select: { copies: true },
        },
      },
    });

    return book;
  }

  async generateCopies(bookId: string, dt: { tenantId: string, count: number }) {
      const book = await this.prisma.book.findUnique({ where: { id: bookId }, include: { copies: { take: 1 } } });
      if (!book) throw new NotFoundException('Book not found');

      const existingCount = await this.prisma.bookCopy.count({ where: { bookId } });
      
      // Determine prefix: use existing if available, else generate new unique
      let prefix = '';
      if (book.copies.length > 0) {
          prefix = book.copies[0].code.split('-')[0];
      } else {
          prefix = await this.getUniquePrefix(dt.tenantId, book.title, bookId);
      }

      const copiesData: any[] = [];
      for (let i = 0; i < dt.count; i++) {
            copiesData.push({
                tenantId: dt.tenantId,
                bookId: bookId,
                code: `${prefix}-${(existingCount + i + 1).toString().padStart(4, '0')}`,
                status: BookStatus.AVAILABLE
            });
      }

      await this.prisma.bookCopy.createMany({
          data: copiesData
      });

      await this.updateBookCounts(bookId);
      return { success: true, count: dt.count };
  }

  async addCopy(createCopyDto: CreateBookCopyDto) {
    // Check if book exists
    const book = await this.prisma.book.findUnique({
      where: { id: createCopyDto.bookId },
      include: { copies: { take: 1 } }
    });
    if (!book) throw new NotFoundException('Book not found');

    let code = createCopyDto.code;
    if (!code) {
        const existingCount = await this.prisma.bookCopy.count({ where: { bookId: createCopyDto.bookId } });
        
        let prefix = '';
        if (book.copies.length > 0) {
            prefix = book.copies[0].code.split('-')[0];
        } else {
            prefix = await this.getUniquePrefix(createCopyDto.tenantId, book.title, book.id);
        }
        
        code = `${prefix}-${(existingCount + 1).toString().padStart(4, '0')}`;
    }

    const copy = await this.prisma.bookCopy.create({
      data: {
        tenantId: createCopyDto.tenantId,
        bookId: createCopyDto.bookId,
        code: code,
        shelf: createCopyDto.shelf,
        status: createCopyDto.status || BookStatus.AVAILABLE,
      },
    });

    // Update available copies count
    await this.updateBookCounts(createCopyDto.bookId);
    return copy;
  }

  async migrateCodes() {
      // Fetch all books with their copies
      const books = await this.prisma.book.findMany({ 
          include: { 
              copies: { orderBy: { createdAt: 'asc' } } 
          } 
      });

      let updatedCount = 0;
      
      // Phase 1: Rename ALL copies to TEMP to avoid ANY collision.
      // This is necessary because renaming Book A to 'ABC-0001' might collide with Book B which currently has 'ABC-0001'.
      
      // We can do this in parallel chunks or just sequential for safety.
      const allCopies = books.flatMap(b => b.copies);
      for (const copy of allCopies) {
          // Optimization: If already TEMP, skip (in case of re-run crash).
          if (copy.code.startsWith('TEMP-')) continue;
          
          await this.prisma.bookCopy.update({
              where: { id: copy.id },
              data: { code: `TEMP-${copy.id}` }
          });
      }

      // Phase 2: Assign Final Codes
      const usedPrefixes = new Set<string>();

      for (const book of books) {
          if (book.copies.length === 0) continue;

          // Generate Unique Prefix
          let basePrefix = this.getPrefix(book.title);
          let prefix = basePrefix;
          let counter = 2;
          
          while (usedPrefixes.has(prefix)) {
              prefix = `${basePrefix}${counter}`;
              counter++;
          }
          usedPrefixes.add(prefix);

          for (let i = 0; i < book.copies.length; i++) {
              const copy = book.copies[i];
              const newCode = `${prefix}-${(i + 1).toString().padStart(4, '0')}`;
              
              await this.prisma.bookCopy.update({
                  where: { id: copy.id },
                  data: { code: newCode }
              });
              updatedCount++;
          }
      }
      return { message: `Migrated codes for ${updatedCount} copies across ${books.length} books.` };
  }

  async findAll(params: {
    tenantId: string;
    search?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { tenantId, search, category, page = 1, pageSize = 10 } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BookWhereInput = {
      tenantId,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { author: { contains: search, mode: 'insensitive' } },
              { isbn: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              { publisher: { contains: search, mode: 'insensitive' } },
              { copies: { some: { code: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [books, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          _count: {
            select: { copies: true },
          },
          copies: {
            take: 5, // Preview copies
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.book.count({ where }),
    ]);

    return {
      data: books,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        copies: true,
        _count: {
          select: { copies: true },
        },
      },
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async findByCode(tenantId: string, code: string) {
    // Find a specific copy by barcode
    const copy = await this.prisma.bookCopy.findUnique({
      where: {
        tenantId_code: {
          tenantId,
          code,
        },
      },
      include: {
        book: true,
        transactions: {
          where: { returnDate: null },
          orderBy: { issueDate: 'desc' },
          take: 1,
          include: { student: true }, // Show current borrower
        },
      },
    });
    if (!copy) throw new NotFoundException('Book copy not found');
    return copy;
  }

  async update(id: string, updateBookDto: UpdateBookDto) {
    return this.prisma.book.update({
      where: { id },
      data: updateBookDto,
    });
  }

  async remove(id: string) {
    return this.prisma.book.delete({
      where: { id },
    });
  }

  async removeCopy(copyId: string) {
     const copy = await this.prisma.bookCopy.delete({
      where: { id: copyId },
    });
    // Update counts
    await this.updateBookCounts(copy.bookId);
    return copy;
  }

  // Helper to maintain counters if needed, though with relations we can just count()
  // But updating cached fields on Book model is useful for quick listing.
  private async updateBookCounts(bookId: string) {
    const total = await this.prisma.bookCopy.count({
      where: { bookId },
    });
    const available = await this.prisma.bookCopy.count({
      where: { bookId, status: 'AVAILABLE' },
    });

    await this.prisma.book.update({
      where: { id: bookId },
      data: {
        totalCopies: total,
        availableCopies: available,
        status: available > 0 ? BookStatus.AVAILABLE : BookStatus.ISSUED, // Simplify status logic
      },
    });
  }
}
