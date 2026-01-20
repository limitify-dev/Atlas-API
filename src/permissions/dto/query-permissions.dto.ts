import { ApiProperty } from '@nestjs/swagger';
import {
  PermissionType,
  PermissionStatus,
  PermissionRequestedBy,
} from '../../../prisma/generated/client';
import { IsOptional, IsString, IsEnum, IsInt, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPermissionsDto {
  @ApiProperty({
    description: 'Search query for student name or permission title',
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
    description: 'Filter by permission type',
    enum: PermissionType,
    required: false,
  })
  @IsEnum(PermissionType)
  @IsOptional()
  permissionType?: PermissionType;

  @ApiProperty({
    description: 'Filter by permission status',
    enum: PermissionStatus,
    required: false,
  })
  @IsEnum(PermissionStatus)
  @IsOptional()
  status?: PermissionStatus;

  @ApiProperty({
    description: 'Filter by who requested',
    enum: PermissionRequestedBy,
    required: false,
  })
  @IsEnum(PermissionRequestedBy)
  @IsOptional()
  requestedBy?: PermissionRequestedBy;

  @ApiProperty({
    description: 'Filter by from date (permissions starting from this date)',
    example: '2025-01-01',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiProperty({
    description: 'Filter by to date (permissions ending by this date)',
    example: '2025-12-31',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  toDate?: string;

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
