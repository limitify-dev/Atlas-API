import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from '../../common/module-access/module-access.service';

/** Platform module catalog — seeded on boot so Studio always has rows to toggle. */
const MODULE_CATALOG: Array<{
  key: string;
  name: string;
  description: string;
  isCore: boolean;
}> = [
  {
    key: 'academics',
    name: 'Academics',
    description:
      'Classes, subjects, timetable, gradebook, report cards and promotions.',
    isCore: false,
  },
  {
    key: 'attendance',
    name: 'Attendance',
    description: 'Campus check-in / check-out and in-class attendance.',
    isCore: false,
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Fee structures, invoicing, payments and financial reporting.',
    isCore: false,
  },
  {
    key: 'connect',
    name: 'Atlas Connect',
    description: 'School-community messaging, announcements, events, moments and polls.',
    isCore: false,
  },
];

@Injectable()
export class StudioModulesService implements OnModuleInit {
  private readonly logger = new Logger(StudioModulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  async onModuleInit() {
    await this.ensureCatalog();
  }

  /** Upsert the known platform modules. Safe to run on every boot. */
  async ensureCatalog() {
    try {
      await Promise.all(
        MODULE_CATALOG.map((m) =>
          this.prisma.studioModule.upsert({
            where: { key: m.key },
            create: m,
            update: { name: m.name, description: m.description },
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`module catalog seed skipped: ${String(err)}`);
    }
  }

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
          create: {
            tenantId,
            moduleId: mod.id,
            enabled: enabledKeys.includes(mod.key),
          },
          update: { enabled: enabledKeys.includes(mod.key) },
        }),
      ),
    );

    await this.moduleAccess.invalidate(tenantId);
    return this.findForTenant(tenantId);
  }

  /** Enable default modules for a new tenant (all core modules + specified extras) */
  async enableDefaults(tenantId: string, extraKeys: string[] = []) {
    const defaultKeys = [
      'academics',
      'attendance',
      'finance',
      'connect',
      ...extraKeys,
    ];
    const modules = await this.prisma.studioModule.findMany({
      where: { OR: [{ isCore: true }, { key: { in: defaultKeys } }] },
    });

    await this.prisma.tenantModule.createMany({
      data: modules.map((m) => ({ tenantId, moduleId: m.id, enabled: true })),
      skipDuplicates: true,
    });
    await this.moduleAccess.invalidate(tenantId);
  }

  /** Check if a tenant has a specific module enabled */
  async isEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const row = await this.prisma.tenantModule.findFirst({
      where: { tenantId, module: { key: moduleKey }, enabled: true },
    });
    return !!row;
  }
}
