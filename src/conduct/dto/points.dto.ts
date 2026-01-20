import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
} from 'class-validator';

export class DeductPointsDto {
  @ApiProperty({
    description: 'Student ID',
    example: 'uuid-student-id',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Points to deduct',
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  points: number;

  @ApiProperty({
    description: 'Reason for deduction',
    example: 'Late to class',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    description: 'Related conduct record ID (optional)',
    example: 'uuid-conduct-record-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  conductRecordId?: string;
}

export class AddPointsDto {
  @ApiProperty({
    description: 'Student ID',
    example: 'uuid-student-id',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Points to add',
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(50)
  points: number;

  @ApiProperty({
    description: 'Reason for adding points',
    example: 'Excellent behavior during assembly',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
