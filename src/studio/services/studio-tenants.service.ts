import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  CreateStudioTenantDto,
  UpdateTenantStatusDto,
  UpdateTenantDto,
} from '../dto';
import { StudioModulesService } from './studio-modules.service';
import { StudioSubscriptionService } from './studio-subscription.service';
import { AdminProvisionService } from './admin-provision.service';
import {
  AdminInvite,
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
        adminInvites: { orderBy: { createdAt: 'desc' }, take: 5 },
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

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        timezone: dto.timezone || 'UTC',
        brandColor: dto.brandColor || '#1e40af',
        status: 'TRIAL',
      },
    });

    // Parallel: subscription + modules
    await Promise.all([
      this.subscriptionService.createTrial(
        tenant.id,
        (dto.plan as SubscriptionPlan) || SubscriptionPlan.BASIC,
        dto.trialDays ?? 30,
      ),
      this.modulesService.enableDefaults(tenant.id),
    ]);

    // Admin invite if contact provided
    let invite: AdminInvite | null = null;
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

  async update(
    id: string,
    dto: UpdateTenantDto,
    logoFile?: Express.Multer.File,
  ) {
    await this.findOne(id);

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
          logoUrl = urlData.publicUrl;
        }
      } catch {
        /* logo upload failure is non-fatal */
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.brandColor !== undefined && { brandColor: dto.brandColor }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(logoUrl !== undefined && { logo: logoUrl }),
      },
    });
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
