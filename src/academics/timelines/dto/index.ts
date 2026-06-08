import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  AcademicWindowType,
  AcademicWindowStatus,
} from '../../../../prisma/generated/client';

export class CreateAcademicTimelineDto {
  @ApiProperty({ example: 'Term 1 Grade Submission Window' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: AcademicWindowType })
  @IsEnum(AcademicWindowType)
  type: AcademicWindowType;

  @ApiProperty({
    example: '2024-2025',
    description: 'Academic year this window belongs to',
  })
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { message: 'academicYear must be in the format YYYY-YYYY (e.g. 2024-2025)' })
  academicYear: string;

  @ApiPropertyOptional({
    example: 'T1',
    description: 'Term identifier within the academic year — omit for full-year windows',
  })
  @IsString()
  @IsOptional()
  term?: string;

  @ApiProperty({ example: '2025-01-15T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2025-01-31T23:59:59.000Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 'Teachers must submit all term grades by the end date.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Grade UUIDs this window applies to. Omit or pass null for school-wide windows.',
    example: ['uuid-grade-1', 'uuid-grade-2'],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  gradeIds?: string[];
}

export class UpdateAcademicTimelineDto extends PartialType(CreateAcademicTimelineDto) {}

export class AcademicTimelineFiltersDto {
  @ApiPropertyOptional({ enum: AcademicWindowType })
  @IsEnum(AcademicWindowType)
  @IsOptional()
  type?: AcademicWindowType;

  @ApiPropertyOptional({ enum: AcademicWindowStatus })
  @IsEnum(AcademicWindowStatus)
  @IsOptional()
  status?: AcademicWindowStatus;

  @ApiPropertyOptional({ example: '2024-2025' })
  @IsString()
  @IsOptional()
  academicYear?: string;

  @ApiPropertyOptional({ example: 'T1' })
  @IsString()
  @IsOptional()
  term?: string;

  @ApiPropertyOptional({
    description: 'Return only windows that are currently open (startDate <= now <= endDate)',
    type: Boolean,
  })
  @IsOptional()
  currentOnly?: boolean;
}
