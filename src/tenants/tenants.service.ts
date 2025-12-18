import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a new tenant with admin registration token
   * @param createTenantDto - Tenant creation data
   * @param createdBy - Super admin user ID who created the tenant
   * @returns Created tenant with registration token info
   * @throws ConflictException if slug or domain already exists
   */
  async create(createTenantDto: CreateTenantDto, createdBy?: string) {
    // Check if slug already exists
    const existingTenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: createTenantDto.slug },
          ...(createTenantDto.domain
            ? [{ domain: createTenantDto.domain }]
            : []),
        ],
      },
    });

    if (existingTenant) {
      if (existingTenant.slug === createTenantDto.slug) {
        throw new ConflictException('Slug already exists');
      }
      if (existingTenant.domain === createTenantDto.domain) {
        throw new ConflictException('Domain already exists');
      }
    }

    // Check if admin email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createTenantDto.adminEmail },
    });

    if (existingUser) {
      throw new ConflictException('Admin email already exists');
    }

    // Extract admin fields
    const { adminEmail, adminName, ...tenantData } = createTenantDto;

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: tenantData as any,
    });

    // Generate registration token for admin
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Token expires in 7 days

    const registrationToken = await this.prisma.registrationToken.create({
      data: {
        email: adminEmail,
        token,
        tenantId: tenant.id,
        role: 'ADMIN' as any,
        expiresAt,
        createdBy: createdBy || 'system',
      },
    });

    // Send registration email
    await this.emailService.sendRegistrationToken(
      adminEmail,
      token,
      tenant.name,
    );

    return {
      tenant,
      registrationToken: {
        email: adminEmail,
        token,
        expiresAt,
      },
    };
  }

  /**
   * Get all tenants
   * @returns Array of tenants
   */
  async findAll() {
    return await this.prisma.tenant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get tenant by ID
   * @param id - Tenant ID
   * @returns Tenant or null
   */
  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            students: true,
            teachers: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  /**
   * Get tenant by slug
   * @param slug - Tenant slug
   * @returns Tenant or null
   */
  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  /**
   * Update tenant
   * @param id - Tenant ID
   * @param updateTenantDto - Update data
   * @returns Updated tenant
   */
  async update(id: string, updateTenantDto: UpdateTenantDto) {
    // Check if tenant exists
    await this.findOne(id);

    // Check if slug or domain conflicts with other tenants
    if (updateTenantDto.slug || updateTenantDto.domain) {
      const existingTenant = await this.prisma.tenant.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            {
              OR: [
                ...(updateTenantDto.slug
                  ? [{ slug: updateTenantDto.slug }]
                  : []),
                ...(updateTenantDto.domain
                  ? [{ domain: updateTenantDto.domain }]
                  : []),
              ],
            },
          ],
        },
      });

      if (existingTenant) {
        if (existingTenant.slug === updateTenantDto.slug) {
          throw new ConflictException('Slug already exists');
        }
        if (existingTenant.domain === updateTenantDto.domain) {
          throw new ConflictException('Domain already exists');
        }
      }
    }

    return await this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto as any,
    });
  }

  /**
   * Delete tenant
   * @param id - Tenant ID
   * @returns Deleted tenant
   */
  async remove(id: string) {
    // Check if tenant exists
    await this.findOne(id);

    return await this.prisma.tenant.delete({
      where: { id },
    });
  }

  /**
   * Get tenant statistics
   * @param id - Tenant ID
   * @returns Tenant statistics
   */
  async getStats(id: string) {
    const tenant = await this.findOne(id);

    const stats = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            students: true,
            teachers: true,
            parents: true,
            grades: true,
            sections: true,
            subjects: true,
            books: true,
            buses: true,
            events: true,
          },
        },
      },
    });

    return {
      ...tenant,
      statistics: stats?._count,
    };
  }
}
