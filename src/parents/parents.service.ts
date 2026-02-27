import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookStatus } from '../../prisma/generated/client';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyChildren(userId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId, tenantId },
      include: {
        children: {
          include: {
            student: {
              include: {
                grade: true,
                section: true,
                card: true,
                parents: {
                  include: {
                    parent: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return [];
    }

    return parent.children.map((child) => {
      const student = child.student;
      return {
        id: student.id,
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName: `${student.firstName} ${student.lastName}`,
        email: student.email,
        phone: student.phone,
        dateOfBirth: student.dateOfBirth,
        gender: student.gender,
        nationality: student.nationality,
        address: student.address,
        bloodGroup: student.bloodGroup,
        rollNumber: student.rollNumber,
        admissionDate: student.admissionDate,
        photoUrl: student.photoUrl,
        status: 'ACTIVE',
        grade: student.grade
          ? {
              id: student.grade.id,
              name: student.grade.name,
              level: student.grade.level,
              educationLevel: student.grade.educationLevel,
            }
          : null,
        section: student.section
          ? {
              id: student.section.id,
              name: student.section.name,
            }
          : null,
        card: student.card
          ? {
              id: student.card.id,
              cardNumber: student.card.cardNumber,
              status: student.card.status,
            }
          : null,
        parents:
          student.parents?.map((sp: any) => ({
            id: sp.parent.id,
            firstName: sp.parent.firstName,
            lastName: sp.parent.lastName,
            fullName: `${sp.parent.firstName} ${sp.parent.lastName}`,
            userId: sp.parent.user?.id,
            email: sp.parent.user?.email,
            phone: sp.parent.user?.phone,
            relationship: sp.parent.relationship,
            occupation: sp.parent.occupation,
            isPrimary: sp.isPrimary,
          })) ?? [],
      };
    });
  }

  async getMyFinancials(userId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId, tenantId },
      select: {
        id: true,
        children: {
          select: {
            studentId: true,
          },
        },
      },
    });

    if (!parent) {
      return { invoices: [], summary: { outstanding: 0, count: 0 } };
    }

    const studentIds = parent.children.map((c) => c.studentId);
    if (!studentIds.length) {
      return { invoices: [], summary: { outstanding: 0, count: 0 } };
    }

    const transactions = await this.prisma.bookTransaction.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        fine: { gt: 0 },
        OR: [
          { remarks: { contains: 'Reported Missing', mode: 'insensitive' } },
          { bookCopy: { status: BookStatus.LOST } },
        ],
      },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            author: true,
            price: true,
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentId: true,
            section: {
              select: { id: true, name: true },
            },
            grade: {
              select: { id: true, name: true },
            },
          },
        },
        bookCopy: {
          select: {
            id: true,
            code: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const invoices = transactions.map((txn) => {
      const amount = Number(txn.fine || txn.book?.price || 0);
      return {
        id: txn.id,
        type: 'LIBRARY_MISSING_BOOK',
        amount,
        currency: 'USD',
        status: 'UNPAID',
        issuedAt: txn.updatedAt,
        description: `Missing book: ${txn.book?.title || 'Unknown Book'}`,
        book: txn.book
          ? {
              id: txn.book.id,
              title: txn.book.title,
              author: txn.book.author,
              price: Number(txn.book.price || 0),
            }
          : null,
        bookCopy: txn.bookCopy
          ? {
              id: txn.bookCopy.id,
              code: txn.bookCopy.code,
              status: txn.bookCopy.status,
            }
          : null,
        student: txn.student
          ? {
              id: txn.student.id,
              studentId: txn.student.studentId,
              fullName: `${txn.student.firstName} ${txn.student.lastName}`.trim(),
              section: txn.student.section?.name || null,
              grade: txn.student.grade?.name || null,
            }
          : null,
        transaction: {
          id: txn.id,
          issueDate: txn.issueDate,
          dueDate: txn.dueDate,
          returnDate: txn.returnDate,
          remarks: txn.remarks,
        },
      };
    });

    const outstanding = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    return {
      invoices,
      summary: {
        outstanding: Number(outstanding.toFixed(2)),
        count: invoices.length,
      },
    };
  }
}
