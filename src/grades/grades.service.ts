import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { Prisma } from '../../prisma/generated/client';

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createGradeDto: CreateGradeDto) {
    try {
      // Check if grade with same code already exists
      const existingGrade = await this.prisma.grade.findFirst({
        where: {
          tenantId,
          code: createGradeDto.code,
        },
      });

      if (existingGrade) {
        throw new ConflictException(`Grade with code "${createGradeDto.code}" already exists`);
      }

      return await this.prisma.grade.create({
        data: {
          ...createGradeDto,
          tenantId,
        },
        include: {
          sections: true,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('A grade with this code already exists');
        }
      }
      throw new BadRequestException('Failed to create grade');
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.grade.findMany({
      where: { tenantId },
      include: {
        sections: true,
      },
      orderBy: {
        level: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const grade = await this.prisma.grade.findUnique({
      where: { id },
      include: {
        sections: true,
      },
    });

    if (!grade || grade.tenantId !== tenantId) {
      throw new NotFoundException(`Grade with ID ${id} not found`);
    }

    return grade;
  }

  async update(tenantId: string, id: string, updateGradeDto: UpdateGradeDto) {
    try {
      await this.findOne(tenantId, id); // Ensure existence and ownership

      // Check if updating code would create a duplicate
      if (updateGradeDto.code) {
        const existingGrade = await this.prisma.grade.findFirst({
          where: {
            tenantId,
            code: updateGradeDto.code,
            NOT: { id },
          },
        });

        if (existingGrade) {
          throw new ConflictException(`Grade with code "${updateGradeDto.code}" already exists`);
        }
      }

      return await this.prisma.grade.update({
        where: { id },
        data: updateGradeDto,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('A grade with this code already exists');
        }
      }
      throw new BadRequestException('Failed to update grade');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id); // Ensure existence and ownership

      return await this.prisma.grade.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException('Cannot delete grade because it has associated sections or students');
        }
      }
      throw new BadRequestException('Failed to delete grade');
    }
  }
}
