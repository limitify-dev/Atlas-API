import { ApiProperty } from '@nestjs/swagger';
import { ConductType } from '../../../prisma/generated/client';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreateConductRecordDto {
  @ApiProperty({
    description: 'Student ID',
    example: 'uuid-student-id',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Type of conduct record',
    enum: ConductType,
    example: 'WARNING',
  })
  @IsEnum(ConductType)
  @IsNotEmpty()
  type: ConductType;

  @ApiProperty({
    description: 'Description of the incident',
    example: 'Disrupted class during lesson',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Date of the incident',
    example: '2025-01-15',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: 'Severity level (1=Minor, 2=Moderate, 3=Major)',
    example: 1,
    required: false,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Max(3)
  @IsOptional()
  severity?: number;

  @ApiProperty({
    description: 'Points to deduct for this incident',
    example: 5,
    required: false,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  pointsDeducted?: number;

  @ApiProperty({
    description: 'Action taken',
    example: 'Verbal warning given',
    required: false,
  })
  @IsString()
  @IsOptional()
  actionTaken?: string;
}
