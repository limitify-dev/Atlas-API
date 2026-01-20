import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Prisma, EducationLevel } from '../../prisma/generated/client';

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

      // Fetch the grade to check its education level
      const grade = await this.prisma.grade.findUnique({
        where: { id: createSectionDto.gradeId },
        select: { educationLevel: true },
      });

      if (!grade) {
        throw new NotFoundException(`Grade with ID ${createSectionDto.gradeId} not found`);
      }

      // Enforce combination rules based on education level
      if (grade.educationLevel === EducationLevel.ADVANCED) {
        // For Advanced Level, a combinationId is required
        if (!createSectionDto.combinationId) {
          throw new BadRequestException(
            `Subject combination is required for Advanced Level grades.`,
          );
        }
        // Also verify the combination exists and belongs to the same tenant
        const combination = await this.prisma.combination.findUnique({
          where: { id: createSectionDto.combinationId, tenantId },
        });
        if (!combination) {
          throw new BadRequestException(
            `Invalid combination ID ${createSectionDto.combinationId}`,
          );
        }
      } else {
        // For PRIMARY, NURSERY, ORDINARY, subject combinations are not allowed
        if (createSectionDto.combinationId) {
          throw new BadRequestException(
            `Subject combinations are not allowed for ${grade.educationLevel} level grades.`,
          );
        }
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
