import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../../prisma/generated/client';
import { CreateStaffDto, StaffFiltersDto, UpdateStaffDto } from './dto';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStaffDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });

    if (!user) throw new NotFoundException('User not found in this tenant.');

    const existing = await this.prisma.staff.findUnique({
      where: { userId: dto.userId },
    });
    if (existing)
      throw new ConflictException(
        'A staff profile already exists for this user.',
      );

    // Ensure the user's role is set to STAFF
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { role: Role.STAFF },
    });

    return this.prisma.staff.create({
      data: {
        tenantId,
        userId: dto.userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        department: dto.department,
        staffRole: dto.staffRole,
        photoUrl: dto.photoUrl,
        joiningDate: new Date(dto.joiningDate),
      },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });
  }

  async findAll(tenantId: string, filters: StaffFiltersDto) {
    const where: any = { tenantId };
    if (filters.staffRole) where.staffRole = filters.staffRole;
    if (filters.department) where.department = filters.department;

    return this.prisma.staff.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            status: true,
            avatar: true,
          },
        },
      },
    });
    if (!staff) throw new NotFoundException('Staff member not found.');
    return staff;
  }

  async findByUserId(userId: string) {
    return this.prisma.staff.findUnique({
      where: { userId },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId },
    });
    if (!staff) throw new NotFoundException('Staff member not found.');

    return this.prisma.staff.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        department: dto.department,
        staffRole: dto.staffRole,
        photoUrl: dto.photoUrl,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId },
    });
    if (!staff) throw new NotFoundException('Staff member not found.');

    // Reset role back to USER on deletion so they don't retain STAFF access
    await this.prisma.user.update({
      where: { id: staff.userId },
      data: { role: Role.USER },
    });

    return this.prisma.staff.delete({ where: { id } });
  }

  /** Returns distinct staffRole values used in this tenant */
  async getRoles(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.staff.findMany({
      where: { tenantId },
      select: { staffRole: true },
      distinct: ['staffRole'],
    });
    return rows.map((r) => r.staffRole).sort();
  }
}
