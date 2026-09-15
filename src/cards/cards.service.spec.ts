import { Test } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { CardsService } from './cards.service';

function rowsToFile(rows: Record<string, string>[]): Express.Multer.File {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cards');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { buffer } as Express.Multer.File;
}

describe('CardsService.processBulkUpload — Student ID auto-assign', () => {
  let service: CardsService;
  let cards: Map<string, any>;
  let students: Record<string, { id: string }>;

  const makePrisma = () => ({
    card: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.tenantId_cardNumber) {
          return Promise.resolve(
            cards.get(where.tenantId_cardNumber.cardNumber) ?? null,
          );
        }
        if (where.studentId) {
          for (const c of cards.values()) {
            if (c.studentId === where.studentId) return Promise.resolve(c);
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn(({ data }: any) => {
        if (cards.has(data.cardNumber)) {
          throw new Error('Card with this number already exists');
        }
        const row = { id: `card-${data.cardNumber}`, studentId: null, ...data };
        cards.set(data.cardNumber, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        const entry = [...cards.values()].find(
          (c) => c.id === where.id || c.cardNumber === where.tenantId_cardNumber?.cardNumber,
        );
        Object.assign(entry, data);
        return Promise.resolve(entry);
      }),
    },
    student: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(students[where.studentId] ?? null),
      ),
    },
  });

  beforeEach(async () => {
    cards = new Map();
    students = {
      'STU-1': { id: 'student-uuid-1' },
      'STU-2': { id: 'student-uuid-2' },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardsService,
        { provide: PrismaService, useValue: makePrisma() },
      ],
    }).compile();
    service = moduleRef.get(CardsService);
  });

  it('creates a new card and links it to the matching student', async () => {
    const file = rowsToFile([
      { 'Card Number': 'C1', 'Card Type': 'STUDENT', 'Student ID': 'STU-1' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
    expect(cards.get('C1').studentId).toBe('student-uuid-1');
  });

  it('links an already-existing unassigned card', async () => {
    cards.set('C1', { id: 'card-C1', cardNumber: 'C1', studentId: null });
    const file = rowsToFile([
      { 'Card Number': 'C1', 'Card Type': 'STUDENT', 'Student ID': 'STU-1' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
    expect(cards.get('C1').studentId).toBe('student-uuid-1');
  });

  it('re-uploading an already-correct row is a no-op success, not an error', async () => {
    cards.set('C1', {
      id: 'card-C1',
      cardNumber: 'C1',
      studentId: 'student-uuid-1',
    });
    const file = rowsToFile([
      { 'Card Number': 'C1', 'Card Type': 'STUDENT', 'Student ID': 'STU-1' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
  });

  it('skips (does not throw for) a Student ID that does not exist', async () => {
    const file = rowsToFile([
      { 'Card Number': 'C1', 'Card Type': 'STUDENT', 'Student ID': 'GHOST' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toMatch(/GHOST.*not found/);
    expect(cards.has('C1')).toBe(false); // nothing partially written
  });

  it('skips a student who already has a different card assigned', async () => {
    cards.set('C-old', {
      id: 'card-old',
      cardNumber: 'C-old',
      studentId: 'student-uuid-1',
    });
    const file = rowsToFile([
      { 'Card Number': 'C-new', 'Card Type': 'STUDENT', 'Student ID': 'STU-1' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toMatch(/already has a different card/);
    expect(cards.has('C-new')).toBe(false);
  });

  it('skips a card number already assigned to a different student', async () => {
    cards.set('C1', {
      id: 'card-C1',
      cardNumber: 'C1',
      studentId: 'student-uuid-2', // belongs to STU-2 already
    });
    const file = rowsToFile([
      { 'Card Number': 'C1', 'Card Type': 'STUDENT', 'Student ID': 'STU-1' },
    ]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result.success).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toMatch(/already assigned to a different student/);
    expect(cards.get('C1').studentId).toBe('student-uuid-2'); // untouched
  });

  it('a row with no Student ID still creates a plain unassigned card (backward compatible)', async () => {
    const file = rowsToFile([{ 'Card Number': 'C1', 'Card Type': 'TEACHER' }]);
    const result = await service.processBulkUpload(file, 't1');
    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
    expect(cards.get('C1').studentId).toBeNull();
  });
});
