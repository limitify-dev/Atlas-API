import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new tenant
   * @param createTenantDto - Tenant creation data
   * @returns Created tenant
   * @throws ConflictException if slug or domain already exists
   */
  async create(createTenantDto: CreateTenantDto) {
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

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: createTenantDto as any,
    });

    return tenant;
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
