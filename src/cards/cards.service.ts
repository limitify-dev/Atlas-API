import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import * as XLSX from 'xlsx';
import { CardType, Prisma } from '../../prisma/generated/client';

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createCardDto: CreateCardDto) {
    // Check if card number already exists for this tenant
    const existing = await this.prisma.card.findUnique({
      where: {
        tenantId_cardNumber: {
          tenantId,
          cardNumber: createCardDto.cardNumber,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Card with this number already exists');
    }

    return this.prisma.card.create({
      data: {
        tenantId,
        ...createCardDto,
        status: 'INACTIVE', // Default status
      },
    });
  }

  async findAll(
    tenantId: string,
    query?: { search?: string; unassigned?: boolean },
  ) {
    const where: Prisma.CardWhereInput = {
      tenantId,
      ...(query?.search && {
        OR: [
          { cardNumber: { contains: query.search, mode: 'insensitive' } },
          { notes: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...(query?.unassigned && {
        studentId: null,
        teacherId: null,
      }),
    };

    return this.prisma.card.findMany({
      where,
      include: {
        student: {
          select: { firstName: true, lastName: true, rollNumber: true },
        },
        teacher: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: {
        student: true,
        teacher: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!card || card.tenantId !== tenantId) {
      throw new NotFoundException('Card not found');
    }

    return card;
  }

  async update(tenantId: string, id: string, updateCardDto: UpdateCardDto) {
    // Verify existence
    const card = await this.findOne(tenantId, id);

    // Handle Assignment Logic
    if (updateCardDto.studentId !== undefined) {
      // If assigning to a student, ensure student exists and is in same tenant
      if (updateCardDto.studentId) {
        const student = await this.prisma.student.findUnique({
          where: { id: updateCardDto.studentId },
        });
        if (!student || student.tenantId !== tenantId) {
          throw new BadRequestException('Student not found');
        }

        // Validate card type matches the assignment
        if (card.cardType !== CardType.STUDENT) {
          throw new BadRequestException(
            `Cannot assign a ${card.cardType} card to a student. This card can only be assigned to a ${card.cardType.toLowerCase()}.`,
          );
        }

        const existingCard = await this.prisma.card.findUnique({
          where: { studentId: updateCardDto.studentId },
        });
        if (existingCard && existingCard.id !== id) {
          throw new BadRequestException(
            'Student already has a card assigned. Unassign it first.',
          );
        }
      }
    }

    if (updateCardDto.teacherId !== undefined) {
      if (updateCardDto.teacherId) {
        const teacher = await this.prisma.teacher.findUnique({
          where: { id: updateCardDto.teacherId },
        });
        if (!teacher || teacher.tenantId !== tenantId) {
          throw new BadRequestException('Teacher not found');
        }

        // Validate card type matches the assignment
        if (card.cardType !== CardType.TEACHER) {
          throw new BadRequestException(
            `Cannot assign a ${card.cardType} card to a teacher. This card can only be assigned to a ${card.cardType.toLowerCase()}.`,
          );
        }

        const existingCard = await this.prisma.card.findUnique({
          where: { teacherId: updateCardDto.teacherId },
        });
        if (existingCard && existingCard.id !== id) {
          throw new BadRequestException(
            'Teacher already has a card assigned. Unassign it first.',
          );
        }
      }
    }

    // Perform Update
    const updatedCard = await this.prisma.card.update({
      where: { id },
      data: {
        ...updateCardDto,
        ...(updateCardDto.studentId ? { teacherId: null } : {}),
        ...(updateCardDto.teacherId ? { studentId: null } : {}),
      },
    });

    return updatedCard;
  }

  async getStatistics(tenantId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalCards,
      activeCards,
      unassignedCards,
      lostOrDamagedCards,
      newCardsThisWeek,
    ] = await Promise.all([
      this.prisma.card.count({ where: { tenantId } }),
      this.prisma.card.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.card.count({
        where: {
          tenantId,
          studentId: null,
          teacherId: null,
        },
      }),
      this.prisma.card.count({
        where: {
          tenantId,
          status: { in: ['LOST', 'DAMAGED'] },
        },
      }),
      this.prisma.card.count({
        where: {
          tenantId,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    return {
      totalCards,
      activeCards,
      unassignedCards,
      lostOrDamagedCards,
      newCardsThisWeek,
    };
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.card.delete({
      where: { id },
    });
  }

  async processBulkUpload(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const results: { success: number; failed: number; errors: any[] } = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const [index, row] of data.entries()) {
      try {
        const rowData = row as any;

        const getVal = (key: string) => {
          const foundKey = Object.keys(rowData).find(
            (k) =>
              k.toLowerCase().replace(/\s/g, '') ===
              key.toLowerCase().replace(/\s/g, ''),
          );
          return foundKey ? rowData[foundKey] : undefined;
        };

        const cardNumber = String(getVal('CardNumber') || getVal('RFID') || '');
        const cardTypeRaw = String(
          getVal('CardType') || 'STUDENT',
        ).toUpperCase();
        const notes = getVal('Notes') ? String(getVal('Notes')) : undefined;
        // Student Name isn't looked up by — it's just there for whoever
        // prepared the sheet to visually confirm the row against Student ID,
        // which is the actual (unambiguous) match key.
        const studentIdCode = getVal('StudentID')
          ? String(getVal('StudentID')).trim()
          : undefined;

        if (!cardNumber) {
          throw new Error('Card Number is required');
        }

        if (!Object.values(CardType).includes(cardTypeRaw as any)) {
          throw new Error(
            `Invalid Card Type: ${cardTypeRaw}. Must be one of: ${Object.values(CardType).join(', ')}`,
          );
        }

        // Resolved (and conflict-checked against the student's *other*
        // cards) before touching this card, so a bad Student ID or a
        // student who already has a different card skips the row cleanly
        // rather than partially writing anything.
        const studentUuid = studentIdCode
          ? await this.resolveStudentForCardAssignment(
              tenantId,
              studentIdCode,
              cardNumber,
            )
          : undefined;

        const existing = await this.prisma.card.findUnique({
          where: { tenantId_cardNumber: { tenantId, cardNumber } },
        });

        if (!existing) {
          const dto: CreateCardDto = {
            cardNumber,
            cardType: cardTypeRaw as CardType,
            notes,
          };
          await this.create(tenantId, dto);
          if (studentUuid) {
            await this.prisma.card.update({
              where: { tenantId_cardNumber: { tenantId, cardNumber } },
              data: { studentId: studentUuid },
            });
          }
        } else if (studentUuid && !existing.studentId) {
          // Card already existed (e.g. from an earlier unassigned bulk
          // upload) — this row is just linking it to a student now.
          await this.prisma.card.update({
            where: { id: existing.id },
            data: { studentId: studentUuid },
          });
        } else if (studentUuid && existing.studentId !== studentUuid) {
          throw new Error(
            `Card ${cardNumber} is already assigned to a different student`,
          );
        }
        // else: card exists and (already matches, or this row carries no
        // Student ID) — nothing to change, still counts as a success.

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: index + 2,
          error: error.message,
          data: row,
        });
      }
    }

    return results;
  }

  /**
   * Resolves a bulk-import row's human-facing Student ID to the student's
   * internal id, and makes sure assigning `cardNumber` to them wouldn't
   * silently override a card they already have (Card.studentId is unique,
   * so a student can only ever hold one). Throws — the caller's per-row
   * try/catch turns that into a skipped, reported row rather than aborting
   * the whole file or overwriting an existing assignment.
   */
  private async resolveStudentForCardAssignment(
    tenantId: string,
    studentIdCode: string,
    cardNumber: string,
  ): Promise<string> {
    const student = await this.prisma.student.findFirst({
      where: { tenantId, studentId: studentIdCode },
      select: { id: true },
    });
    if (!student) {
      throw new Error(`Student ID "${studentIdCode}" not found`);
    }

    const currentCard = await this.prisma.card.findUnique({
      where: { studentId: student.id },
      select: { cardNumber: true },
    });
    if (currentCard && currentCard.cardNumber !== cardNumber) {
      throw new Error(
        `Student ${studentIdCode} already has a different card assigned (${currentCard.cardNumber})`,
      );
    }

    return student.id;
  }

  getBulkUploadTemplate(): Buffer {
    const columns = [
      'Card Number',
      'Card Type',
      'Student ID',
      'Student Name',
      'Notes',
    ];

    const data = [
      {
        'Card Number': 'A1-B2-C3-D4',
        'Card Type': 'STUDENT',
        'Student ID': 'STU-0042',
        'Student Name': 'Aline Uwase',
        Notes: 'Standard student card',
      },
      {
        'Card Number': 'E5-F6-G7-H8',
        'Card Type': 'TEACHER',
        'Student ID': '',
        'Student Name': '',
        Notes: 'Staff access card',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cards');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async bulkActivate(
    tenantId: string,
    cardIds: string[],
  ): Promise<{ updated: number }> {
    // Filter to only assigned cards
    const cards = await this.prisma.card.findMany({
      where: {
        tenantId,
        id: { in: cardIds },
        OR: [{ studentId: { not: null } }, { teacherId: { not: null } }],
      },
    });

    if (cards.length === 0) {
      throw new BadRequestException('No assigned cards found in selection');
    }

    // Update all to ACTIVE status
    const result = await this.prisma.card.updateMany({
      where: {
        id: { in: cards.map((c) => c.id) },
      },
      data: {
        status: 'ACTIVE',
      },
    });

    return { updated: result.count };
  }
}
