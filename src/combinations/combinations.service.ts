import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCombinationDto } from './dto/create-combination.dto';
import { UpdateCombinationDto } from './dto/update-combination.dto';
import { Prisma } from '../../prisma/generated/client';

@Injectable()
export class CombinationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, createCombinationDto: CreateCombinationDto) {
    try {
      // Check if combination with same code already exists for this tenant
      const existingCombination = await this.prisma.combination.findFirst({
        where: {
          tenantId,
          code: createCombinationDto.code,
        },
      });

      if (existingCombination) {
        throw new ConflictException(
          `Combination "${createCombinationDto.code}" already exists`,
        );
      }

      return await this.prisma.combination.create({
        data: {
          ...createCombinationDto,
          subjectIds: createCombinationDto.subjectIds ?? [],
          tenantId,
        },
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'A combination with this code already exists',
          );
        }
      }
      throw new BadRequestException('Failed to create combination');
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.combination.findMany({
      where: { tenantId },
      orderBy: {
        code: 'asc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const combination = await this.prisma.combination.findUnique({
      where: { id },
    });

    if (!combination || combination.tenantId !== tenantId) {
      throw new NotFoundException(`Combination with ID ${id} not found`);
    }

    return combination;
  }

  async update(
    tenantId: string,
    id: string,
    updateCombinationDto: UpdateCombinationDto,
  ) {
    try {
      await this.findOne(tenantId, id); // Ensure existence and ownership

      // Check if updating code would create a duplicate
      if (updateCombinationDto.code) {
        const existingCombination = await this.prisma.combination.findFirst({
          where: {
            tenantId,
            code: updateCombinationDto.code,
            NOT: { id },
          },
        });

        if (existingCombination) {
          throw new ConflictException(
            `Combination with code "${updateCombinationDto.code}" already exists`,
          );
        }
      }

      return await this.prisma.combination.update({
        where: { id },
        data: updateCombinationDto,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'A combination with this code already exists',
          );
        }
      }
      throw new BadRequestException('Failed to update combination');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id); // Ensure existence and ownership

      return await this.prisma.combination.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new ConflictException(
            'Cannot delete combination because it has associated sections',
          );
        }
      }
      throw new BadRequestException('Failed to delete combination');
    }
  }
}
