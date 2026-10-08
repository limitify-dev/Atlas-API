import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../../prisma/generated/client';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
    description: 'Filter by section (classroom) ID',
    example: 'uuid-section-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  sectionId?: string;

  @ApiProperty({
    description: 'Filter by promotion (cohort) ID',
    example: 'uuid-promotion-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  promotionId?: string;

  @ApiProperty({
    description:
      'Filter by subject combination — accepts the combination code (e.g. "MCB") or its UUID',
    example: 'MCB',
    required: false,
  })
  @IsString()
  @IsOptional()
  combination?: string;

  @ApiProperty({
    description: 'Filter by gender',
    enum: Gender,
    example: 'MALE',
    required: false,
  })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({
    description:
      'Filter by whether the student has a profile photo (for e-Registration triage). Omit to leave unfiltered.',
  })
  @IsOptional()
  // Preserve `undefined` when the param is absent — unlike a single
  // false-defaults-fine toggle, omitting this must mean "don't filter",
  // not "filter to hasPhoto=false", or every other GET /students caller
  // that doesn't pass this param would silently start being filtered.
  @Transform(({ obj, key }) =>
    obj[key] === undefined ? undefined : obj[key] === true || obj[key] === 'true',
  )
  @IsBoolean()
  hasPhoto?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by whether the student already has an RFID card linked. Omit to leave unfiltered.',
  })
  @IsOptional()
  @Transform(({ obj, key }) =>
    obj[key] === undefined ? undefined : obj[key] === true || obj[key] === 'true',
  )
  @IsBoolean()
  hasCard?: boolean;

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
