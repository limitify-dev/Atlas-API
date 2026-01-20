import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({
    description: 'Name of the section',
    example: 'A',
  })
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

  @ApiProperty({
    description: 'Capacity of the section',
    example: 40,
    required: false,
  })
  @IsInt()
  @IsOptional()
  capacity?: number;

  @ApiProperty({
    description: 'Combination ID for Advanced Level sections',
    example: 'uuid-combination-id',
    required: false,
  })
  @IsString()
  @IsOptional()
  combinationId?: string;
}
