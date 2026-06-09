import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  QueryPermissionsDto,
  PermissionResponseDto,
  PermissionListResponseDto,
  PermissionQrDataDto,
  PermissionStatsDto,
  CardCheckoutDto,
  CheckoutResponseDto,
} from './dto';
import {
  PermissionType,
  PermissionStatus,
  PermissionRequestedBy,
  Role,
} from '../../prisma/generated/client';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createPermissionDto: CreatePermissionDto,
    tenantId: string,
    userId: string,
    userRole: Role,
  ): Promise<PermissionResponseDto> {
    // Verify student exists
    const student = await this.prisma.student.findFirst({
      where: { id: createPermissionDto.studentId, tenantId },
      include: { grade: true, section: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Determine requestedBy based on user role
    let requestedBy =
      createPermissionDto.requestedBy || PermissionRequestedBy.ADMIN;
    if (userRole === Role.TEACHER) {
      requestedBy = PermissionRequestedBy.TEACHER;
    } else if (userRole === Role.STAFF) {
      requestedBy = PermissionRequestedBy.PARENT;
    }

    // Auto-approve for admin/teacher requests, pending for parent requests
    const autoApprove = requestedBy !== PermissionRequestedBy.PARENT;
    const status = autoApprove
      ? PermissionStatus.APPROVED
      : PermissionStatus.PENDING;

    // Prepare schedule data for recurring permissions
    const schedule = createPermissionDto.scheduleDays
      ? { days: createPermissionDto.scheduleDays }
      : undefined;

    // Create the permission
    const permission = await this.prisma.permission.create({
      data: {
        tenantId,
        studentId: createPermissionDto.studentId,
        permissionType: createPermissionDto.permissionType,
        title: createPermissionDto.title,
        reason: createPermissionDto.reason,
        fromDate: new Date(createPermissionDto.fromDate),
        toDate: new Date(createPermissionDto.toDate),
        fromTime: createPermissionDto.fromTime,
        toTime: createPermissionDto.toTime,
        schedule,
        status,
        requestedBy,
        requestedById: userId,
        approvedBy: autoApprove ? userId : null,
        approvedAt: autoApprove ? new Date() : null,
        remarks: createPermissionDto.remarks,
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

    // Generate QR code data for approved one-time permissions
    if (
      permission.permissionType === PermissionType.ONE_TIME &&
      permission.status === PermissionStatus.APPROVED
    ) {
      const qrData = this.generateQrCodeData(permission);
      await this.prisma.permission.update({
        where: { id: permission.id },
        data: { qrCode: JSON.stringify(qrData) },
      });
      permission.qrCode = JSON.stringify(qrData);
    }

    return await this.formatPermissionResponse(permission);
  }

  async findAll(
    tenantId: string,
    query: QueryPermissionsDto,
  ): Promise<PermissionListResponseDto> {
    const {
      search,
      studentId,
      permissionType,
      status,
      requestedBy,
      fromDate,
      toDate,
      gradeId,
      sectionId,
      page = 1,
      limit = 10,
    } = query;

    const where: any = { tenantId };

    if (studentId) {
      where.studentId = studentId;
    }

    if (permissionType) {
      where.permissionType = permissionType;
    }

    if (status) {
      where.status = status;
    }

    if (requestedBy) {
      where.requestedBy = requestedBy;
    }

    if (fromDate) {
      where.fromDate = { gte: new Date(fromDate) };
    }

    if (toDate) {
      where.toDate = { ...(where.toDate || {}), lte: new Date(toDate) };
    }

    if (gradeId || sectionId) {
      where.student = {};
      if (gradeId) where.student.gradeId = gradeId;
      if (sectionId) where.student.sectionId = sectionId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { studentId: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [permissions, total] = await Promise.all([
      this.prisma.permission.findMany({
        where,
        include: {
          student: {
            include: {
              grade: true,
              section: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.permission.count({ where }),
    ]);

    return {
      data: await Promise.all(
        permissions.map((p) => this.formatPermissionResponse(p)),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, tenantId: string): Promise<PermissionResponseDto> {
    const permission = await this.prisma.permission.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          include: {
            grade: true,
            section: true,
          },
        },
      },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return await this.formatPermissionResponse(permission);
  }

  async update(
    id: string,
    updatePermissionDto: UpdatePermissionDto,
    tenantId: string,
  ): Promise<PermissionResponseDto> {
    const existing = await this.prisma.permission.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Permission not found');
    }

    // Only allow updates on pending permissions
    if (existing.status !== PermissionStatus.PENDING) {
      throw new BadRequestException('Can only update pending permissions');
    }

    const schedule = updatePermissionDto.scheduleDays
      ? { days: updatePermissionDto.scheduleDays }
      : (existing.schedule as { days: number[] } | undefined);

    const permission = await this.prisma.permission.update({
      where: { id },
      data: {
        title: updatePermissionDto.title ?? existing.title,
        reason: updatePermissionDto.reason ?? existing.reason,
        fromDate: updatePermissionDto.fromDate
          ? new Date(updatePermissionDto.fromDate)
          : existing.fromDate,
        toDate: updatePermissionDto.toDate
          ? new Date(updatePermissionDto.toDate)
          : existing.toDate,
        fromTime: updatePermissionDto.fromTime ?? existing.fromTime,
        toTime: updatePermissionDto.toTime ?? existing.toTime,
        schedule,
        remarks: updatePermissionDto.remarks ?? existing.remarks,
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

    return await this.formatPermissionResponse(permission);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const permission = await this.prisma.permission.findFirst({
      where: { id, tenantId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    await this.prisma.permission.delete({ where: { id } });
  }

  async approve(
    id: string,
    tenantId: string,
    userId: string,
    remarks?: string,
  ): Promise<PermissionResponseDto> {
    const permission = await this.prisma.permission.findFirst({
      where: { id, tenantId },
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (permission.status !== PermissionStatus.PENDING) {
      throw new BadRequestException('Permission is not pending approval');
    }

    const updatedPermission = await this.prisma.permission.update({
      where: { id },
      data: {
        status: PermissionStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
        remarks: remarks || permission.remarks,
      },
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
    });

    // Generate QR code for one-time permissions
    if (updatedPermission.permissionType === PermissionType.ONE_TIME) {
      const qrData = this.generateQrCodeData(updatedPermission);
      await this.prisma.permission.update({
        where: { id },
        data: { qrCode: JSON.stringify(qrData) },
      });
      updatedPermission.qrCode = JSON.stringify(qrData);
    }

    return this.formatPermissionResponse(updatedPermission);
  }

  async reject(
    id: string,
    tenantId: string,
    userId: string,
    remarks?: string,
  ): Promise<PermissionResponseDto> {
    const permission = await this.prisma.permission.findFirst({
      where: { id, tenantId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (permission.status !== PermissionStatus.PENDING) {
      throw new BadRequestException('Permission is not pending');
    }

    const updatedPermission = await this.prisma.permission.update({
      where: { id },
      data: {
        status: PermissionStatus.REJECTED,
        approvedBy: userId,
        approvedAt: new Date(),
        remarks: remarks || 'Permission rejected',
      },
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
    });

    return this.formatPermissionResponse(updatedPermission);
  }

  async checkActivePermission(
    studentId: string,
    tenantId: string,
    checkTime?: Date,
  ): Promise<{ hasPermission: boolean; permission?: any }> {
    const now = checkTime || new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Check for one-time permissions (not used yet)
    const oneTimePermission = await this.prisma.permission.findFirst({
      where: {
        studentId,
        tenantId,
        permissionType: PermissionType.ONE_TIME,
        status: PermissionStatus.APPROVED,
        qrCodeUsed: false,
        fromDate: { lte: now },
        toDate: { gte: now },
      },
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
    });

    if (oneTimePermission) {
      return { hasPermission: true, permission: oneTimePermission };
    }

    // Check for recurring permissions
    const recurringPermissions = await this.prisma.permission.findMany({
      where: {
        studentId,
        tenantId,
        permissionType: PermissionType.RECURRING,
        status: PermissionStatus.APPROVED,
        fromDate: { lte: now },
        toDate: { gte: now },
      },
      include: {
        student: {
          include: { grade: true, section: true },
        },
      },
    });

    for (const permission of recurringPermissions) {
      const schedule = permission.schedule as { days: number[] } | null;
      if (schedule?.days?.includes(currentDay)) {
        // Check time window if specified
        if (permission.fromTime && permission.toTime) {
          if (
            currentTime >= permission.fromTime &&
            currentTime <= permission.toTime
          ) {
            return { hasPermission: true, permission };
          }
        } else {
          // No time restriction
          return { hasPermission: true, permission };
        }
      }
    }

    return { hasPermission: false };
  }

  async processCardCheckout(
    data: CardCheckoutDto,
    tenantId: string,
  ): Promise<CheckoutResponseDto> {
    const checkoutTime = new Date(data.checkoutTime);

    // Find the card
    const card = await this.prisma.card.findFirst({
      where: {
        cardNumber: data.cardNumber,
        tenantId,
        status: 'ACTIVE',
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

    if (!card) {
      return {
        success: false,
        message: 'Card not found or inactive',
        error: 'CARD_NOT_FOUND',
      };
    }

    if (!card.student) {
      return {
        success: false,
        message: 'Card is not assigned to a student',
        error: 'NOT_STUDENT_CARD',
      };
    }

    // Check for active permission
    const { hasPermission, permission } = await this.checkActivePermission(
      card.studentId!,
      tenantId,
      checkoutTime,
    );

    if (!hasPermission || !permission) {
      // Log the denied checkout attempt
      await this.prisma.cardLog.create({
        data: {
          tenantId,
          cardId: card.id,
          action: 'CHECKOUT_DENIED',
          location: data.location || 'checkout',
          description: `Checkout denied - No active permission`,
        },
      });

      return {
        success: false,
        message: 'No active permission for checkout',
        studentName: `${card.student.firstName} ${card.student.lastName}`,
        error: 'NO_PERMISSION',
      };
    }

    // Process checkout based on permission type
    if (permission.permissionType === PermissionType.ONE_TIME) {
      // Mark QR code as used
      await this.prisma.permission.update({
        where: { id: permission.id },
        data: {
          qrCodeUsed: true,
          usedAt: checkoutTime,
        },
      });
    } else {
      // Create usage record for recurring permission
      await this.prisma.permissionUsage.create({
        data: {
          tenantId,
          permissionId: permission.id,
          usedAt: checkoutTime,
          checkoutTime,
          location: data.location,
        },
      });
    }

    // Log the successful checkout
    await this.prisma.cardLog.create({
      data: {
        tenantId,
        cardId: card.id,
        action: 'CHECKOUT',
        location: data.location || 'checkout',
        description: `Checkout approved - Permission: ${permission.title || permission.reason}`,
      },
    });

    // Update card last used
    await this.prisma.card.update({
      where: { id: card.id },
      data: { lastUsedAt: checkoutTime },
    });

    return {
      success: true,
      message: 'Checkout successful',
      permissionId: permission.id,
      studentName: `${card.student.firstName} ${card.student.lastName}`,
      reason: permission.reason,
      checkoutTime: checkoutTime.toISOString(),
      permissionType: permission.permissionType,
    };
  }

  async getStats(tenantId: string): Promise<PermissionStatsDto> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      total,
      pending,
      approved,
      rejected,
      oneTime,
      recurring,
      used,
      unused,
      activeToday,
    ] = await Promise.all([
      this.prisma.permission.count({ where: { tenantId } }),
      this.prisma.permission.count({
        where: { tenantId, status: PermissionStatus.PENDING },
      }),
      this.prisma.permission.count({
        where: { tenantId, status: PermissionStatus.APPROVED },
      }),
      this.prisma.permission.count({
        where: { tenantId, status: PermissionStatus.REJECTED },
      }),
      this.prisma.permission.count({
        where: { tenantId, permissionType: PermissionType.ONE_TIME },
      }),
      this.prisma.permission.count({
        where: { tenantId, permissionType: PermissionType.RECURRING },
      }),
      this.prisma.permission.count({
        where: {
          tenantId,
          permissionType: PermissionType.ONE_TIME,
          qrCodeUsed: true,
        },
      }),
      this.prisma.permission.count({
        where: {
          tenantId,
          permissionType: PermissionType.ONE_TIME,
          status: PermissionStatus.APPROVED,
          qrCodeUsed: false,
        },
      }),
      this.prisma.permission.count({
        where: {
          tenantId,
          status: PermissionStatus.APPROVED,
          fromDate: { lte: endOfDay },
          toDate: { gte: startOfDay },
        },
      }),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      oneTime,
      recurring,
      used,
      unused,
      activeToday,
    };
  }

  private generateQrCodeData(permission: any): PermissionQrDataDto {
    return {
      permissionId: permission.id,
      studentId: permission.studentId,
      studentName: `${permission.student.firstName} ${permission.student.lastName}`,
      title: permission.title,
      reason: permission.reason,
      fromDate: permission.fromDate.toISOString().split('T')[0],
      toDate: permission.toDate.toISOString().split('T')[0],
      fromTime: permission.fromTime,
      toTime: permission.toTime,
      issuedAt: permission.createdAt.toISOString(),
      expiresAt: permission.toDate.toISOString(),
      grade: permission.student.grade?.name,
      section: permission.student.section?.name,
      tenantName: permission.tenant?.name || 'School',
    };
  }

  private async formatPermissionResponse(
    permission: any,
  ): Promise<PermissionResponseDto> {
    let approvedByName: string | undefined;

    // Fetch approver's name if approvedBy exists
    if (permission.approvedBy) {
      try {
        const approver = await this.prisma.user.findUnique({
          where: { id: permission.approvedBy },
          select: { name: true },
        });
        approvedByName = approver?.name;
      } catch (error) {
        console.error('Failed to fetch approver name:', error);
        approvedByName = 'Unknown User';
      }
    }

    return {
      id: permission.id,
      tenantId: permission.tenantId,
      studentId: permission.studentId,
      permissionType: permission.permissionType,
      requestDate: permission.requestDate,
      title: permission.title,
      reason: permission.reason,
      fromDate: permission.fromDate,
      toDate: permission.toDate,
      fromTime: permission.fromTime,
      toTime: permission.toTime,
      schedule: permission.schedule,
      status: permission.status,
      requestedBy: permission.requestedBy,
      requestedById: permission.requestedById,
      approvedBy: approvedByName || permission.approvedBy, // Use name if available, otherwise fall back to ID
      approvedAt: permission.approvedAt,
      remarks: permission.remarks,
      qrCode: permission.qrCode,
      qrCodeUsed: permission.qrCodeUsed,
      usedAt: permission.usedAt,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
      student: {
        id: permission.student.id,
        studentId: permission.student.studentId,
        firstName: permission.student.firstName,
        lastName: permission.student.lastName,
        photoUrl: permission.student.photoUrl,
        grade: permission.student.grade
          ? {
              id: permission.student.grade.id,
              name: permission.student.grade.name,
              code: permission.student.grade.code,
            }
          : undefined,
        section: permission.student.section
          ? {
              id: permission.student.section.id,
              name: permission.student.section.name,
            }
          : undefined,
      },
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expirePermissions() {
    const now = new Date();

    //Expire ONE_TIME and RECURRING permissions whose toDate has passed
    const result = await this.prisma.permission.updateMany({
      where: {
        status: PermissionStatus.APPROVED,
        toDate: { lt: now },
      },
      data: { status: PermissionStatus.EXPIRED },
    });
    this.logger.log(
      `Expired ${result.count} permissions at ${now.toISOString()}`,
    );
  }
}
