import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../prisma/generated/client';
import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryStudentsDto {
  @ApiProperty({
    description: 'Search query for student name, ID, or email',
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
    description: 'Filter by gender',
    enum: Gender,
    example: 'MALE',
    required: false,
  })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

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
