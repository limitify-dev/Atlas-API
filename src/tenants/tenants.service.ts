import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from 'src/common/supabase/supabase.service';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

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
      data: createTenantDto,
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
   * @param logoFile - Optional logo file
   * @returns Updated tenant
   */
  async update(
    id: string,
    updateTenantDto: UpdateTenantDto,
    logoFile?: Express.Multer.File,
  ) {
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

    let logoUrl: string | undefined;

    // Handle logo upload
    if (logoFile) {
      try {
        const fileExt = logoFile.originalname.split('.').pop() || 'png';
        const fileName = `logo.${fileExt}`;
        const filePath = `tenants/${id}/${fileName}`;

        const { error: uploadError } = await this.supabase.client.storage
          .from('atlas-profiles')
          .upload(filePath, logoFile.buffer, {
            contentType: logoFile.mimetype,
            upsert: true,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error(
            `Logo upload failed for tenant ${id}:`,
            uploadError.message,
          );
        } else {
          const { data: urlData } = this.supabase.client.storage
            .from('atlas-profiles')
            .getPublicUrl(filePath);
          logoUrl = urlData.publicUrl;
        }
      } catch (uploadErr) {
        console.error(
          `Unexpected error during logo upload for tenant ${id}:`,
          uploadErr,
        );
      }
    }

    // Parse numeric fields that may come as strings from FormData
    const updateData: {
      maxStudents?: number;
      maxTeachers?: number;
    } = { ...updateTenantDto };
    if (updateData.maxStudents !== undefined) {
      updateData.maxStudents = Number(updateData.maxStudents);
    }
    if (updateData.maxTeachers !== undefined) {
      updateData.maxTeachers = Number(updateData.maxTeachers);
    }

    return await this.prisma.tenant.update({
      where: { id },
      data: {
        ...updateData,
        ...(logoUrl && { logo: logoUrl }),
      },
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
            teachers: true,
            grades: true,
            sections: true,
            subjects: true,
            books: true,
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
