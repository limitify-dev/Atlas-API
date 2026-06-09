import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ description: 'Name of the section/classroom', example: 'A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Grade ID this section belongs to',
    example: 'uuid-grade-id',
  })
  @IsString()
  @IsNotEmpty()
  gradeId: string;

  @ApiPropertyOptional({
    description: 'Promotion (cohort) this classroom belongs to',
    example: 'uuid-promotion-id',
  })
  @IsUUID()
  @IsOptional()
  promotionId?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of students',
    example: 40,
  })
  @IsInt()
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description:
      'Subject combination ID — required for Advanced Level sections only',
    example: 'uuid-combination-id',
  })
  @IsString()
  @IsOptional()
  combinationId?: string;
}
