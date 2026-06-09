import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../prisma/generated/client';

export class InvoiceFiltersDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ example: '2025-T1' })
  @IsString()
  @IsOptional()
  term?: string;

  @ApiPropertyOptional({ example: 'tuition' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueBefore?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueAfter?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
