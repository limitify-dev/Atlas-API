import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import type { GatedModuleKey } from './require-module.decorator';

/** The platform modules that are gate-able per tenant. */
export const GATED_MODULES: GatedModuleKey[] = [
  'academics',
  'finance',
  'attendance',
  'connect',
];

/**
 * Resolves which platform modules a tenant may use.
 *
 * Fail-open: a module is considered enabled unless there is an explicit
 * `tenant_modules` row with `enabled = false`. This keeps existing tenants
 * (which have no rows) fully functional until Atlas Studio restricts them.
 */
@Injectable()
export class ModuleAccessService {
  private readonly logger = new Logger(ModuleAccessService.name);
  private readonly ttlSeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private cacheKey(tenantId: string) {
    return `module-access:${tenantId}`;
  }

  /**
   * Map of gated module key → enabled. Missing keys default to `true`.
   * Cached briefly per tenant.
   */
  async getModuleMap(tenantId: string): Promise<Record<string, boolean>> {
    const cached = await this.cache.get<Record<string, boolean>>(
      this.cacheKey(tenantId),
    );
    if (cached) return cached;

    const map: Record<string, boolean> = {};
    for (const key of GATED_MODULES) map[key] = true;

    try {
      const rows = await this.prisma.tenantModule.findMany({
        where: { tenantId, module: { key: { in: GATED_MODULES } } },
        select: { enabled: true, module: { select: { key: true } } },
      });
      for (const row of rows) map[row.module.key] = row.enabled;
    } catch (err) {
      // Catalog table missing / query error → stay fail-open.
      this.logger.warn(
        `module lookup failed for tenant ${tenantId}: ${String(err)}`,
      );
    }

    await this.cache.set(this.cacheKey(tenantId), map, this.ttlSeconds);
    return map;
  }

  /** Is a single module enabled for the tenant? Fail-open. */
  async isEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    if (!GATED_MODULES.includes(moduleKey as GatedModuleKey)) return true;
    const map = await this.getModuleMap(tenantId);
    return map[moduleKey] !== false;
  }

  /** The gated modules currently enabled for the tenant. */
  async getEnabledModules(tenantId: string): Promise<GatedModuleKey[]> {
    const map = await this.getModuleMap(tenantId);
    return GATED_MODULES.filter((key) => map[key] !== false);
  }

  /** Drop the cached map — call after Studio changes a tenant's modules. */
  async invalidate(tenantId: string): Promise<void> {
    await this.cache.del(this.cacheKey(tenantId));
  }
}
