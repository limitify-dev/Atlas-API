import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../../prisma/generated/client';
import { SupportContact } from './subscription-billing.service';

@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return (row?.value as T) ?? null;
  }

  async set(key: string, value: unknown, updatedById?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedById },
      create: { key, value: value as Prisma.InputJsonValue, updatedById },
    });
  }

  async getSupportContact(): Promise<SupportContact> {
    return (
      (await this.get<SupportContact>('support.contact')) ?? {
        email: process.env.SUPPORT_EMAIL ?? null,
        phone: process.env.SUPPORT_PHONE ?? null,
      }
    );
  }
}
