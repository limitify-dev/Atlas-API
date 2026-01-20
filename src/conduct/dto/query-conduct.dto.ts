import { ApiProperty } from '@nestjs/swagger';
import { ConductType, IncidentStatus } from '../../../prisma/generated/client';
import { IsOptional, IsString, IsEnum, IsInt, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryConductRecordsDto {
  @ApiProperty({
    description: 'Search query for student name or description',
    example: 'John',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Filter by student ID',
    example: 'uuid-student-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  studentId?: string;

  @ApiProperty({
    description: 'Filter by conduct type',
    enum: ConductType,
    required: false,
  })
  @IsEnum(ConductType)
  @IsOptional()
  type?: ConductType;

  @ApiProperty({
    description: 'Filter by incident status',
    enum: IncidentStatus,
    required: false,
  })
  @IsEnum(IncidentStatus)
  @IsOptional()
  status?: IncidentStatus;

  @ApiProperty({
    description: 'Filter by grade ID',
    example: 'uuid-grade-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  gradeId?: string;

  @ApiProperty({
    description: 'Filter by section ID',
    example: 'uuid-section-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  sectionId?: string;

  @ApiProperty({
    description: 'Filter by severity level',
    example: 2,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  severity?: number;

  @ApiProperty({
    description: 'Filter by from date',
    example: '2025-01-01',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiProperty({
    description: 'Filter by to date',
    example: '2025-12-31',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;
}

export class QueryPointsDto {
  @ApiProperty({
    description: 'Search query for student name',
    example: 'John',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    description: 'Filter by grade ID',
    example: 'uuid-grade-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  gradeId?: string;

  @ApiProperty({
    description: 'Filter by section ID',
    example: 'uuid-section-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  sectionId?: string;

  @ApiProperty({
    description: 'Minimum points filter',
    example: 0,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minPoints?: number;

  @ApiProperty({
    description: 'Maximum points filter',
    example: 100,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maxPoints?: number;

  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    required: false,
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    required: false,
    default: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  @ApiProperty({
    description: 'Sort order',
    example: 'asc',
    required: false,
    default: 'desc',
  })
  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
