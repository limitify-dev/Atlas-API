import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateConductRecordDto,
  UpdateConductRecordDto,
  ResolveConductRecordDto,
  QueryConductRecordsDto,
  QueryPointsDto,
  DeductPointsDto,
  AddPointsDto,
  ConductRecordResponseDto,
  ConductRecordListResponseDto,
  StudentPointsResponseDto,
  PointsListResponseDto,
  ConductStatsDto,
  PointsDistributionDto,
} from './dto';
import {
  IncidentStatus,
  PointTransactionType,
} from '../../prisma/generated/client';

@Injectable()
export class ConductService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================
  // Conduct Records
  // =====================================

  async createConductRecord(
    dto: CreateConductRecordDto,
    tenantId: string,
    teacherId: string | null,
    userId: string,
  ): Promise<ConductRecordResponseDto> {
    // Verify student exists
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
      include: { grade: true, section: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Create the conduct record
    const record = await this.prisma.conductRecord.create({
      data: {
        tenantId,
        studentId: dto.studentId,
        type: dto.type,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
        reportedBy: teacherId || undefined, // Optional - undefined for admin users without teacher record
        reportedByUserId: userId, // Always store the user ID
        severity: dto.severity || 1,
        pointsDeducted: dto.pointsDeducted,
        actionTaken: dto.actionTaken,
        incidentStatus: IncidentStatus.ACTIVE,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    // If points deducted, create the point transaction
    if (dto.pointsDeducted && dto.pointsDeducted > 0) {
      await this.deductPointsInternal(
        dto.studentId,
        tenantId,
        dto.pointsDeducted,
        dto.description,
        userId,
        record.id,
      );
    }

    return this.formatConductRecordResponse(record);
  }

  async findAllConductRecords(
    tenantId: string,
    query: QueryConductRecordsDto,
  ): Promise<ConductRecordListResponseDto> {
    const {
      search,
      studentId,
      type,
      status,
      gradeId,
      sectionId,
      severity,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = query;

    const where: any = { tenantId };

    if (studentId) {
      where.studentId = studentId;
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.incidentStatus = status;
    }

    if (severity) {
      where.severity = severity;
    }

    if (fromDate) {
      where.date = { gte: new Date(fromDate) };
    }

    if (toDate) {
      where.date = { ...(where.date || {}), lte: new Date(toDate) };
    }

    if (gradeId || sectionId) {
      where.student = {};
      if (gradeId) where.student.gradeId = gradeId;
      if (sectionId) where.student.sectionId = sectionId;
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { studentId: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.conductRecord.findMany({
        where,
        include: {
          student: {
            include: {
              grade: true,
              section: true,
            },
          },
          teacher: {
            include: {
              user: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.conductRecord.count({ where }),
    ]);

    return {
      data: records.map((r) => this.formatConductRecordResponse(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneConductRecord(
    id: string,
    tenantId: string,
  ): Promise<ConductRecordResponseDto> {
    const record = await this.prisma.conductRecord.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Conduct record not found');
    }

    return this.formatConductRecordResponse(record);
  }

  async updateConductRecord(
    id: string,
    dto: UpdateConductRecordDto,
    tenantId: string,
  ): Promise<ConductRecordResponseDto> {
    const existing = await this.prisma.conductRecord.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Conduct record not found');
    }

    const record = await this.prisma.conductRecord.update({
      where: { id },
      data: {
        type: dto.type ?? existing.type,
        description: dto.description ?? existing.description,
        date: dto.date ? new Date(dto.date) : existing.date,
        severity: dto.severity ?? existing.severity,
        actionTaken: dto.actionTaken ?? existing.actionTaken,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatConductRecordResponse(record);
  }

  async resolveConductRecord(
    id: string,
    dto: ResolveConductRecordDto,
    tenantId: string,
    resolvedById: string,
  ): Promise<ConductRecordResponseDto> {
    const existing = await this.prisma.conductRecord.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Conduct record not found');
    }

    if (existing.incidentStatus === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Record is already resolved');
    }

    const record = await this.prisma.conductRecord.update({
      where: { id },
      data: {
        incidentStatus: IncidentStatus.RESOLVED,
        resolutionNotes: dto.resolutionNotes,
        actionTaken: dto.actionTaken ?? existing.actionTaken,
        resolvedAt: new Date(),
        resolvedBy: resolvedById,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        teacher: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.formatConductRecordResponse(record);
  }

  async removeConductRecord(id: string, tenantId: string): Promise<void> {
    const record = await this.prisma.conductRecord.findFirst({
      where: { id, tenantId },
    });

    if (!record) {
      throw new NotFoundException('Conduct record not found');
    }

    await this.prisma.conductRecord.delete({ where: { id } });
  }

  // =====================================
  // Points Management
  // =====================================

  async initializeStudentPoints(
    studentId: string,
    tenantId: string,
  ): Promise<StudentPointsResponseDto> {
    // Check if already exists
    const existing = await this.prisma.studentConductPoints.findUnique({
      where: { studentId },
    });

    if (existing) {
      return this.getStudentPoints(studentId, tenantId);
    }

    const pointsRecord = await this.prisma.studentConductPoints.create({
      data: {
        tenantId,
        studentId,
        currentPoints: 100,
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
      },
    });

    // Create initial transaction
    await this.prisma.conductPointTransaction.create({
      data: {
        tenantId,
        studentConductPointsId: pointsRecord.id,
        transactionType: PointTransactionType.INITIAL,
        pointsChange: 100,
        pointsBefore: 0,
        pointsAfter: 100,
        reason: 'Initial points allocation',
        recordedBy: 'SYSTEM',
      },
    });

    return this.formatStudentPointsResponse(pointsRecord);
  }

  async getStudentPoints(
    studentId: string,
    tenantId: string,
    includeTransactions = true,
  ): Promise<StudentPointsResponseDto> {
    let pointsRecord = await this.prisma.studentConductPoints.findUnique({
      where: { studentId },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
        transactions: includeTransactions
          ? {
              orderBy: { recordedAt: 'desc' },
              take: 50,
            }
          : false,
      },
    });

    if (!pointsRecord) {
      // Initialize if doesn't exist
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, tenantId },
      });
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      return this.initializeStudentPoints(studentId, tenantId);
    }

    return this.formatStudentPointsResponse(pointsRecord, includeTransactions);
  }

  async getAllStudentsPoints(
    tenantId: string,
    query: QueryPointsDto,
  ): Promise<PointsListResponseDto> {
    const {
      search,
      gradeId,
      sectionId,
      minPoints,
      maxPoints,
      page = 1,
      limit = 10,
      sortOrder = 'desc',
    } = query;

    // Build where clause for students
    const studentWhere: any = { tenantId };

    if (gradeId) studentWhere.gradeId = gradeId;
    if (sectionId) studentWhere.sectionId = sectionId;
    if (search) {
      studentWhere.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { studentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Fetch all students with their conduct points (if any)
    const allStudents = await this.prisma.student.findMany({
      where: studentWhere,
      include: {
        grade: true,
        section: true,
        conductPoints: true,
      },
      orderBy: { firstName: 'asc' },
    });

    // Map students to points response, defaulting to 100 if no record exists
    let studentsWithPoints = allStudents.map((student) => {
      const points = student.conductPoints?.currentPoints ?? 100;
      return {
        id: student.conductPoints?.id || `default-${student.id}`,
        studentId: student.id,
        currentPoints: points,
        lastUpdatedAt: student.conductPoints?.lastUpdatedAt || null,
        student: {
          id: student.id,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
          photoUrl: student.photoUrl || undefined,
          grade: student.grade
            ? {
                id: student.grade.id,
                name: student.grade.name,
                code: student.grade.code,
              }
            : undefined,
          section: student.section
            ? {
                id: student.section.id,
                name: student.section.name,
              }
            : undefined,
        },
        category: this.getPointsCategory(points),
      };
    });

    // Filter by points range if specified
    if (minPoints !== undefined) {
      studentsWithPoints = studentsWithPoints.filter(
        (s) => s.currentPoints >= minPoints,
      );
    }
    if (maxPoints !== undefined) {
      studentsWithPoints = studentsWithPoints.filter(
        (s) => s.currentPoints <= maxPoints,
      );
    }

    // Sort by points
    studentsWithPoints.sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.currentPoints - a.currentPoints;
      }
      return a.currentPoints - b.currentPoints;
    });

    // Apply pagination
    const paginatedStudents = studentsWithPoints.slice(
      (page - 1) * limit,
      page * limit,
    );
    const filteredTotal = studentsWithPoints.length;

    return {
      data: paginatedStudents,
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.ceil(filteredTotal / limit),
    };
  }

  async deductPoints(
    dto: DeductPointsDto,
    tenantId: string,
    recordedById: string,
  ): Promise<StudentPointsResponseDto> {
    await this.deductPointsInternal(
      dto.studentId,
      tenantId,
      dto.points,
      dto.reason,
      recordedById,
      dto.conductRecordId,
    );

    return this.getStudentPoints(dto.studentId, tenantId);
  }

  async addPoints(
    dto: AddPointsDto,
    tenantId: string,
    recordedById: string,
  ): Promise<StudentPointsResponseDto> {
    let pointsRecord = await this.prisma.studentConductPoints.findUnique({
      where: { studentId: dto.studentId },
    });

    if (!pointsRecord) {
      await this.initializeStudentPoints(dto.studentId, tenantId);
      pointsRecord = await this.prisma.studentConductPoints.findUnique({
        where: { studentId: dto.studentId },
      });
    }

    const pointsBefore = pointsRecord!.currentPoints;
    const newPoints = Math.min(100, pointsBefore + dto.points);
    const appliedChange = newPoints - pointsBefore;

    await this.prisma.$transaction([
      this.prisma.studentConductPoints.update({
        where: { id: pointsRecord!.id },
        data: {
          currentPoints: newPoints,
          lastUpdatedAt: new Date(),
        },
      }),
      this.prisma.conductPointTransaction.create({
        data: {
          tenantId,
          studentConductPointsId: pointsRecord!.id,
          transactionType: PointTransactionType.ADDITION,
          pointsChange: appliedChange,
          pointsBefore,
          pointsAfter: newPoints,
          reason: dto.reason,
          recordedBy: recordedById,
        },
      }),
    ]);

    return this.getStudentPoints(dto.studentId, tenantId);
  }

  async resetStudentPoints(
    studentId: string,
    tenantId: string,
    recordedById: string,
  ): Promise<StudentPointsResponseDto> {
    let pointsRecord = await this.prisma.studentConductPoints.findUnique({
      where: { studentId },
    });

    if (!pointsRecord) {
      return this.initializeStudentPoints(studentId, tenantId);
    }

    await this.prisma.$transaction([
      this.prisma.studentConductPoints.update({
        where: { id: pointsRecord.id },
        data: {
          currentPoints: 100,
          lastUpdatedAt: new Date(),
        },
      }),
      this.prisma.conductPointTransaction.create({
        data: {
          tenantId,
          studentConductPointsId: pointsRecord.id,
          transactionType: PointTransactionType.RESET,
          pointsChange: 100 - pointsRecord.currentPoints,
          pointsBefore: pointsRecord.currentPoints,
          pointsAfter: 100,
          reason: 'Administrative reset',
          recordedBy: recordedById,
        },
      }),
    ]);

    return this.getStudentPoints(studentId, tenantId);
  }

  // =====================================
  // Statistics
  // =====================================

  async getStats(tenantId: string): Promise<ConductStatsDto> {
    const [
      totalRecords,
      activeIncidents,
      resolvedIncidents,
      totalWarnings,
      totalDetentions,
      totalSuspensions,
      totalPraises,
      pointsAgg,
      studentsBelow50,
      studentsBelow75,
    ] = await Promise.all([
      this.prisma.conductRecord.count({ where: { tenantId } }),
      this.prisma.conductRecord.count({
        where: { tenantId, incidentStatus: IncidentStatus.ACTIVE },
      }),
      this.prisma.conductRecord.count({
        where: { tenantId, incidentStatus: IncidentStatus.RESOLVED },
      }),
      this.prisma.conductRecord.count({
        where: { tenantId, type: 'WARNING' },
      }),
      this.prisma.conductRecord.count({
        where: { tenantId, type: 'DETENTION' },
      }),
      this.prisma.conductRecord.count({
        where: { tenantId, type: 'SUSPENSION' },
      }),
      this.prisma.conductRecord.count({
        where: { tenantId, type: 'PRAISE' },
      }),
      this.prisma.studentConductPoints.aggregate({
        where: { tenantId },
        _avg: { currentPoints: true },
      }),
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { lt: 50 } },
      }),
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { lt: 75 } },
      }),
    ]);

    return {
      totalRecords,
      activeIncidents,
      resolvedIncidents,
      totalWarnings,
      totalDetentions,
      totalSuspensions,
      totalPraises,
      averagePoints: Math.round(pointsAgg._avg.currentPoints || 100),
      studentsBelow50Points: studentsBelow50,
      studentsBelow75Points: studentsBelow75,
    };
  }

  async getPointsDistribution(tenantId: string): Promise<PointsDistributionDto[]> {
    const totalStudents = await this.prisma.studentConductPoints.count({
      where: { tenantId },
    });

    if (totalStudents === 0) {
      return [
        { range: '90-100 (Excellent)', count: 0, percentage: 0 },
        { range: '75-89 (Good)', count: 0, percentage: 0 },
        { range: '50-74 (Fair)', count: 0, percentage: 0 },
        { range: '0-49 (Needs Improvement)', count: 0, percentage: 0 },
      ];
    }

    const [excellent, good, fair, needsImprovement] = await Promise.all([
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { gte: 90 } },
      }),
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { gte: 75, lt: 90 } },
      }),
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { gte: 50, lt: 75 } },
      }),
      this.prisma.studentConductPoints.count({
        where: { tenantId, currentPoints: { lt: 50 } },
      }),
    ]);

    return [
      {
        range: '90-100 (Excellent)',
        count: excellent,
        percentage: Math.round((excellent / totalStudents) * 100),
      },
      {
        range: '75-89 (Good)',
        count: good,
        percentage: Math.round((good / totalStudents) * 100),
      },
      {
        range: '50-74 (Fair)',
        count: fair,
        percentage: Math.round((fair / totalStudents) * 100),
      },
      {
        range: '0-49 (Needs Improvement)',
        count: needsImprovement,
        percentage: Math.round((needsImprovement / totalStudents) * 100),
      },
    ];
  }

  async getAtRiskStudents(
    tenantId: string,
    threshold = 75,
  ): Promise<StudentPointsResponseDto[]> {
    const students = await this.prisma.studentConductPoints.findMany({
      where: {
        tenantId,
        currentPoints: { lt: threshold },
      },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
      },
      orderBy: { currentPoints: 'asc' },
      take: 20,
    });

    return students.map((s) => this.formatStudentPointsResponse(s, false));
  }

  // =====================================
  // Private Helpers
  // =====================================

  private async deductPointsInternal(
    studentId: string,
    tenantId: string,
    points: number,
    reason: string,
    recordedById: string,
    conductRecordId?: string,
  ): Promise<void> {
    let pointsRecord = await this.prisma.studentConductPoints.findUnique({
      where: { studentId },
    });

    if (!pointsRecord) {
      await this.initializeStudentPoints(studentId, tenantId);
      pointsRecord = await this.prisma.studentConductPoints.findUnique({
        where: { studentId },
      });
    }

    const pointsBefore = pointsRecord!.currentPoints;
    const newPoints = Math.max(0, pointsBefore - points);
    const appliedChange = newPoints - pointsBefore;

    await this.prisma.$transaction([
      this.prisma.studentConductPoints.update({
        where: { id: pointsRecord!.id },
        data: {
          currentPoints: newPoints,
          lastUpdatedAt: new Date(),
        },
      }),
      this.prisma.conductPointTransaction.create({
        data: {
          tenantId,
          studentConductPointsId: pointsRecord!.id,
          conductRecordId,
          transactionType: PointTransactionType.DEDUCTION,
          pointsChange: appliedChange,
          pointsBefore,
          pointsAfter: newPoints,
          reason,
          recordedBy: recordedById,
        },
      }),
    ]);
  }

  private formatConductRecordResponse(record: any): ConductRecordResponseDto {
    return {
      id: record.id,
      tenantId: record.tenantId,
      studentId: record.studentId,
      type: record.type,
      description: record.description,
      date: record.date,
      reportedBy: record.reportedBy,
      severity: record.severity,
      pointsDeducted: record.pointsDeducted,
      incidentStatus: record.incidentStatus,
      actionTaken: record.actionTaken,
      resolutionNotes: record.resolutionNotes,
      resolvedAt: record.resolvedAt,
      resolvedBy: record.resolvedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      student: {
        id: record.student.id,
        studentId: record.student.studentId,
        firstName: record.student.firstName,
        lastName: record.student.lastName,
        photoUrl: record.student.photoUrl,
        grade: record.student.grade
          ? {
              id: record.student.grade.id,
              name: record.student.grade.name,
              code: record.student.grade.code,
            }
          : undefined,
        section: record.student.section
          ? {
              id: record.student.section.id,
              name: record.student.section.name,
            }
          : undefined,
      },
      reporterName: record.teacher?.user?.name,
    };
  }

  private formatStudentPointsResponse(
    record: any,
    includeTransactions = true,
  ): StudentPointsResponseDto {
    const category = this.getPointsCategory(record.currentPoints);

    return {
      id: record.id,
      studentId: record.studentId,
      currentPoints: record.currentPoints,
      lastUpdatedAt: record.lastUpdatedAt,
      student: {
        id: record.student.id,
        studentId: record.student.studentId,
        firstName: record.student.firstName,
        lastName: record.student.lastName,
        photoUrl: record.student.photoUrl,
        grade: record.student.grade
          ? {
              id: record.student.grade.id,
              name: record.student.grade.name,
              code: record.student.grade.code,
            }
          : undefined,
        section: record.student.section
          ? {
              id: record.student.section.id,
              name: record.student.section.name,
            }
          : undefined,
      },
      transactions:
        includeTransactions && record.transactions
          ? record.transactions.map((t: any) => ({
              id: t.id,
              transactionType: t.transactionType,
              pointsChange: t.pointsChange,
              pointsBefore: t.pointsBefore,
              pointsAfter: t.pointsAfter,
              reason: t.reason,
              recordedBy: t.recordedBy,
              recordedAt: t.recordedAt,
              conductRecordId: t.conductRecordId,
            }))
          : undefined,
      category,
    };
  }

  private getPointsCategory(points: number): string {
    if (points >= 90) return 'Excellent';
    if (points >= 75) return 'Good';
    if (points >= 50) return 'Fair';
    return 'Needs Improvement';
  }
}
