import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  CreateStudioTenantDto,
  UpdateTenantAttendanceScheduleDto,
  UpdateTenantStatusDto,
  UpdateTenantDto,
} from '../dto';
import { StudioModulesService } from './studio-modules.service';
import { StudioSubscriptionService } from './studio-subscription.service';
import { AdminProvisionService } from './admin-provision.service';
import {
  AdminInvite,
  ConversationType,
  Prisma,
  SubscriptionPlan,
} from '../../../prisma/generated/client';

@Injectable()
export class StudioTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly modulesService: StudioModulesService,
    private readonly subscriptionService: StudioSubscriptionService,
    private readonly adminProvisionService: AdminProvisionService,
  ) {}

  async findAll() {
    return this.prisma.tenant.findMany({
      include: {
        studioSubscription: true,
        tenantModules: { include: { module: true } },
        _count: {
          select: { users: true, teachers: true, grades: true, sections: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        studioSubscription: true,
        tenantModules: { include: { module: true } },
        adminInvites: { orderBy: { createdAt: 'desc' } },
        _count: {
          select: { users: true, teachers: true, grades: true, sections: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    return tenant;
  }

  /**
   * Full tenant bootstrap:
   * 1. Create tenant
   * 2. Create trial subscription
   * 3. Enable default modules
   * 4. Generate admin invite (if contact provided)
   */
  async create(dto: CreateStudioTenantDto) {
    const existing = await this.prisma.tenant.findFirst({
      where: { OR: [{ slug: dto.slug }, { name: dto.name }] },
    });
    if (existing)
      throw new ConflictException(
        'A tenant with this name or slug already exists.',
      );

    const attendanceStartTime = dto.attendanceStartTime || '08:00';
    const attendanceEndTime = dto.attendanceEndTime || '17:00';
    if (attendanceStartTime >= attendanceEndTime) {
      throw new BadRequestException(
        'School start time must be earlier than school end time.',
      );
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        timezone: dto.timezone || 'UTC',
        brandColor: dto.brandColor || '#1e40af',
        status: 'TRIAL',
        settings: {
          attendance: {
            startTime: attendanceStartTime,
            endTime: attendanceEndTime,
            schoolDays: dto.schoolDays || [1, 2, 3, 4, 5],
          },
        },
      },
    });

    // Subscription + modules. createTrial() syncs the Tenant's legacy plan
    // fields and the computed billing engine's period window/status itself.
    await this.subscriptionService.createTrial(
      tenant.id,
      (dto.plan as SubscriptionPlan) || SubscriptionPlan.BASIC,
      dto.trialDays ?? 30,
    );
    await this.modulesService.enableDefaults(tenant.id);

    // Admin invite if contact provided
    let invite:
      | (AdminInvite & { emailSent?: boolean; emailError?: string })
      | null = null;
    if (dto.adminEmail || dto.adminPhone) {
      invite = await this.adminProvisionService.createInvite(tenant.id, {
        email: dto.adminEmail,
        phone: dto.adminPhone,
        name: dto.adminName,
        role: 'ADMIN',
      });
    }

    return { tenant, invite };
  }

  async updateAttendanceSchedule(
    id: string,
    dto: UpdateTenantAttendanceScheduleDto,
  ) {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException(
        'School start time must be earlier than school end time.',
      );
    }

    const tenant = await this.findOne(id);
    const current =
      tenant.settings &&
      typeof tenant.settings === 'object' &&
      !Array.isArray(tenant.settings)
        ? tenant.settings
        : {};

    return this.prisma.tenant.update({
      where: { id },
      data: {
        settings: {
          ...current,
          attendance: {
            startTime: dto.startTime,
            endTime: dto.endTime,
            schoolDays: dto.schoolDays,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    logoFile?: Express.Multer.File,
  ) {
    await this.findOne(id);

    if (dto.slug !== undefined) {
      const existing = await this.prisma.tenant.findFirst({
        where: { slug: dto.slug, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('A tenant with this slug already exists.');
      }
    }

    let logoUrl: string | undefined;
    if (logoFile) {
      try {
        const fileExt = logoFile.originalname.split('.').pop() || 'png';
        const filePath = `tenants/${id}/logo.${fileExt}`;
        const { error: uploadError } = await this.supabase.client.storage
          .from('atlas-profiles')
          .upload(filePath, logoFile.buffer, {
            contentType: logoFile.mimetype,
            upsert: true,
            cacheControl: '3600',
          });
        if (!uploadError) {
          const { data: urlData } = this.supabase.client.storage
            .from('atlas-profiles')
            .getPublicUrl(filePath);
          // The file path is stable (upsert), so the public URL never changes —
          // browsers, RN <Image>, and the CDN would keep serving the old logo.
          // A version token makes every upload a fresh URL that busts caches.
          logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
        }
      } catch {
        /* logo upload failure is non-fatal */
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.brandColor !== undefined && { brandColor: dto.brandColor }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(logoUrl !== undefined && { logo: logoUrl }),
      },
    });

    // Group/channel conversation avatars are denormalised copies of the tenant
    // logo (set at creation — no per-group custom avatar). Re-point them so the
    // school-wide group/announcement-channel logo adapts when the logo changes.
    if (logoUrl) {
      await this.prisma.conversation
        .updateMany({
          where: {
            tenantId: id,
            type: { in: [ConversationType.GROUP, ConversationType.CHANNEL] },
          },
          data: { avatar: logoUrl },
        })
        .catch((err) =>
          console.error(`Failed to sync group avatars for tenant ${id}:`, err),
        );
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateTenantStatusDto) {
    await this.findOne(id); // throws if not found
    return this.prisma.tenant.update({
      where: { id },
      data: { status: dto.status as any },
    });
  }

  async deleteUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) throw new NotFoundException('User not found in this tenant.');
    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'User removed.' };
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.delete({ where: { id } });
  }
}
