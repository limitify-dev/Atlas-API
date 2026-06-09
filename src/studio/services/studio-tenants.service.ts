import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStudioTenantDto, UpdateTenantStatusDto } from '../dto';
import { StudioModulesService } from './studio-modules.service';
import { StudioSubscriptionService } from './studio-subscription.service';
import { AdminProvisionService } from './admin-provision.service';

@Injectable()
export class StudioTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modulesService: StudioModulesService,
    private readonly subscriptionService: StudioSubscriptionService,
    private readonly adminProvisionService: AdminProvisionService,
  ) {}

  async findAll() {
    return this.prisma.tenant.findMany({
      include: {
        studioSubscription: true,
        tenantModules: { include: { module: true } },
        _count: { select: { users: true, teachers: true, grades: true, sections: true } },
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
        _count: { select: { users: true, teachers: true, grades: true, sections: true } },
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
    if (existing) throw new ConflictException('A tenant with this name or slug already exists.');

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
      this.subscriptionService.createTrial(tenant.id, dto.plan || 'BASIC'),
      this.modulesService.enableDefaults(tenant.id),
    ]);

    // Admin invite if contact provided
    let invite = null;
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

  async updateStatus(id: string, dto: UpdateTenantStatusDto) {
    await this.findOne(id); // throws if not found
    return this.prisma.tenant.update({
      where: { id },
      data: { status: dto.status as any },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.tenant.delete({ where: { id } });
  }
}
