import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '../../../prisma/generated/client';

export class InvoiceFiltersDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  studentId?: string | string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sectionId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  gradeId?: string;

  @ApiPropertyOptional({ example: '2025-T1' })
  @IsString()
  @IsOptional()
  term?: string;

  @ApiPropertyOptional({ example: 'tuition' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'When true, return only archived invoices; defaults to active-only.',
  })
  @IsOptional()
  // Read the raw query value via `obj[key]`, not `value` — with
  // enableImplicitConversion on, class-transformer's implicit Boolean
  // coercion runs before this callback and turns any non-empty string
  // (including "false") into `true`, so `value` would already be corrupted.
  @Transform(({ obj, key }) => obj[key] === true || obj[key] === 'true')
  @IsBoolean()
  archived?: boolean;

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
