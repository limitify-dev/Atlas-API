import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Prisma } from '../../prisma/generated/client';

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createSectionDto: CreateSectionDto) {
    try {
      // Check if section with same name already exists for this grade
      const existingSection = await this.prisma.section.findFirst({
        where: {
          tenantId,
          gradeId: createSectionDto.gradeId,
          name: createSectionDto.name,
        },
      });

      if (existingSection) {
        throw new ConflictException(`Section "${createSectionDto.name}" already exists for this grade`);
      }

      return await this.prisma.section.create({
        data: {
          ...createSectionDto,
          tenantId,
        },
        include: {
          grade: true,
          combination: true,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('A section with this name already exists for this grade');
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid grade or combination ID');
        }
      }
      throw new BadRequestException('Failed to create section');
    }
  }

  async findAll(tenantId: string, gradeId?: string) {
    const where: any = { tenantId };
    if (gradeId) {
      where.gradeId = gradeId;
    }

    return this.prisma.section.findMany({
      where,
      include: {
        grade: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: {
        grade: true,
      },
    });

    if (!section || section.tenantId !== tenantId) {
      throw new NotFoundException(`Section with ID ${id} not found`);
    }

    return section;
  }

  async update(tenantId: string, id: string, updateSectionDto: UpdateSectionDto) {
    await this.findOne(tenantId, id); // Ensure existence and ownership

    return this.prisma.section.update({
      where: { id },
      data: updateSectionDto,
      include: {
        grade: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id); // Ensure existence and ownership

      return await this.prisma.section.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException('Cannot delete section because it has associated students');
        }
      }
      throw new BadRequestException('Failed to delete section');
    }
  }
}
