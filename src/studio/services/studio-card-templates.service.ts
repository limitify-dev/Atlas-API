import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCardTemplateDto, UpdateCardTemplateDto } from '../dto';
import { CardType } from '../../../prisma/generated/client';

const BLANK_SIDE = { version: '6.0.0', objects: [] };
const BLANK_DESIGN = { front: BLANK_SIDE, back: BLANK_SIDE };

@Injectable()
export class StudioCardTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId?: string) {
    return this.prisma.cardTemplate.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.cardTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Card template not found.');
    return template;
  }

  async create(dto: CreateCardTemplateDto, createdBy?: string) {
    if (dto.isDefault) {
      await this.clearExistingDefault(dto.tenantId, dto.cardType ?? CardType.STUDENT);
    }
    return this.prisma.cardTemplate.create({
      data: {
        name: dto.name,
        tenantId: dto.tenantId,
        cardType: dto.cardType ?? CardType.STUDENT,
        widthMm: dto.widthMm ?? 85.6,
        heightMm: dto.heightMm ?? 54,
        design: (dto.design ?? BLANK_DESIGN) as object,
        isDefault: dto.isDefault ?? false,
        createdBy,
      },
    });
  }

  async update(id: string, dto: UpdateCardTemplateDto) {
    const existing = await this.findOne(id);
    if (dto.isDefault) {
      await this.clearExistingDefault(
        existing.tenantId ?? undefined,
        dto.cardType ?? existing.cardType,
      );
    }
    return this.prisma.cardTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.cardType !== undefined && { cardType: dto.cardType }),
        ...(dto.widthMm !== undefined && { widthMm: dto.widthMm }),
        ...(dto.heightMm !== undefined && { heightMm: dto.heightMm }),
        ...(dto.design !== undefined && { design: dto.design as object }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.cardTemplate.delete({ where: { id } });
    return { success: true };
  }

  private async clearExistingDefault(tenantId: string | undefined, cardType: CardType) {
    await this.prisma.cardTemplate.updateMany({
      where: { tenantId: tenantId ?? null, cardType, isDefault: true },
      data: { isDefault: false },
    });
  }
}
