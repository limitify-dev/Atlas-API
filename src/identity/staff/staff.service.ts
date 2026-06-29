import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { Role, Status } from '../../../prisma/generated/client';
import {
  CreateStaffDto,
  RegisterStaffDto,
  StaffFiltersDto,
  UpdateStaffDto,
} from './dto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async register(tenantId: string, dto: RegisterStaffDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone is required.');
    }

    // Check uniqueness
    if (dto.email) {
      const exists = await this.prisma.user.findFirst({
        where: { email: dto.email },
      });
      if (exists)
        throw new ConflictException('A user with this email already exists.');
    }
    if (dto.phone) {
      const exists = await this.prisma.user.findFirst({
        where: { phone: dto.phone },
      });
      if (exists)
        throw new ConflictException('A user with this phone already exists.');
    }

    const fullName = `${dto.firstName} ${dto.lastName}`;
    const base = dto.email
      ? dto.email
          .split('@')[0]
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase()
      : `${dto.firstName}${dto.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
    const taken = await this.prisma.user.findUnique({
      where: { username: base },
    });
    const username = taken ? `${base}${Date.now().toString().slice(-4)}` : base;

    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 12);

    const { user, staff } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          name: fullName,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          username,
          password: hashed,
          role: Role.STAFF,
          status: Status.PENDING,
          emailVerified: false,
        },
      });

      const staff = await tx.staff.create({
        data: {
          tenantId,
          userId: user.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          department: dto.department,
          staffRole: dto.staffRole,
          joiningDate: new Date(dto.joiningDate),
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              status: true,
            },
          },
        },
      });

      return { user, staff };
    });

    let inviteUrl: string | undefined;
    if (dto.email) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);
      const invite = await this.prisma.adminInvite.create({
        data: {
          tenantId,
          email: dto.email,
          name: fullName,
          role: Role.STAFF,
          expiresAt,
          status: 'PENDING',
        },
      });

      const base =
        this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
      inviteUrl = `${base.replace(/\/$/, '')}/admin-setup?token=${invite.token}`;

      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });
        await this.email.sendStaffInviteEmail({
          email: dto.email,
          name: fullName,
          tenantName: tenant?.name ?? 'your school',
          department: dto.department,
          role: dto.staffRole,
          inviteUrl,
        });
      } catch {
        /* non-fatal */
      }
    }

    return { staff, inviteUrl };
  }

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
      data: { role: Role.TEACHER },
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
