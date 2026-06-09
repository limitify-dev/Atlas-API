import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StudioModulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All available platform modules */
  findAll() {
    return this.prisma.studioModule.findMany({ orderBy: { name: 'asc' } });
  }

  /** Modules enabled for a specific tenant */
  async findForTenant(tenantId: string) {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenantId },
      include: { module: true },
    });
    return rows.map((r) => ({ ...r.module, enabled: r.enabled }));
  }

  /** Bulk set enabled modules for a tenant */
  async setForTenant(tenantId: string, enabledKeys: string[]) {
    const allModules = await this.prisma.studioModule.findMany();

    await this.prisma.$transaction(
      allModules.map((mod) =>
        this.prisma.tenantModule.upsert({
          where: { tenantId_moduleId: { tenantId, moduleId: mod.id } },
          create: { tenantId, moduleId: mod.id, enabled: enabledKeys.includes(mod.key) },
          update: { enabled: enabledKeys.includes(mod.key) },
        }),
      ),
    );

    return this.findForTenant(tenantId);
  }

  /** Enable default modules for a new tenant (all core modules + specified extras) */
  async enableDefaults(tenantId: string, extraKeys: string[] = []) {
    const defaultKeys = ['academics', 'attendance', ...extraKeys];
    const modules = await this.prisma.studioModule.findMany({
      where: { OR: [{ isCore: true }, { key: { in: defaultKeys } }] },
    });

    await this.prisma.tenantModule.createMany({
      data: modules.map((m) => ({ tenantId, moduleId: m.id, enabled: true })),
      skipDuplicates: true,
    });
  }

  /** Check if a tenant has a specific module enabled */
  async isEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const row = await this.prisma.tenantModule.findFirst({
      where: { tenantId, module: { key: moduleKey }, enabled: true },
    });
    return !!row;
  }
}
